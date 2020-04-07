const doc = require('global/document')
const win = require('global/window')
const createElement = require('virtual-dom/create-element')
const diff = require('virtual-dom/diff')
const patch = require('virtual-dom/patch')
const h = require('virtual-dom/h')
const debounce = require('debounce')
const xtend = require('xtend')
const mean = require('compute-mean')
const unlerp = require('unlerp')
const lerp = require('lerp')
const unified = require('unified')
const english = require('retext-english')
const stringify = require('retext-stringify')
const readabilityScores = require('readability-scores')

const max = Math.max
const min = Math.min
const round = Math.round
const ceil = Math.ceil

const styleContent = `
[data-readability] .highlight {
	background-color: hsl(0, 0%, 100%);
}

[data-readability] .editor {
	position: relative;
	max-width: 100%;
	overflow: hidden;
}
[data-readability] textarea,
[data-readability] .draw * {
	/* Can’t use a nice font: kerning renders differently in textareas. */
	font-family: monospace;
	font-size: 16px;
	letter-spacing: normal;
	line-height: calc(1em + 1ex);
	white-space: pre-wrap;
	word-wrap: break-word;
	background: transparent;
	box-sizing: border-box;
	border: none;
	outline: none;
	margin: 0;
	padding: 0;
	width: 100%;
	height: 100%;
	overflow: hidden;
	resize: none;
}

[data-readability] textarea,
[data-readability] .draw {
	padding: 6px 12px;
}

[data-readability] .draw {
	-webkit-print-color-adjust: exact;
	color: transparent;
	min-height: 212px;
}

[data-readability] textarea {
	position: absolute;
	top: 0;
	color: inherit;
}

[data-readability] .footer {
	margin-bottom: 1em;
}
[data-readability] .footer .ml {
	margin-left: 1em;
}
`

function roundTo2Decimals(n) {
	return round((n + Number.EPSILON) * 100) / 100
}

function highlight(hue) {
	return {
		style: {
			backgroundColor: 'hsla(' + [hue, '93%', '70%', 0.5].join(', ') + ')'
		}
	}
}

const processor = unified()
	.use(english)
	.use(stringify)

const aReadability = doc.querySelectorAll('[data-readability]')

if (aReadability.length > 0) {
	const style = doc.createElement('style')
	style.textContent = styleContent
	doc.head.append(style)
	for (const [i, element] of aReadability.entries()) {
		plugReadability(element, i)
	}
}

function plugReadability(element, i) {
	const idAndName = element.hasAttribute('data-id-and-name')
		? element.getAttribute('data-id-and-name')
		: 'readability' + (i + 1)
	const maxGrade = element.hasAttribute('data-max-grade') ? Number(element.getAttribute('data-max-grade')) : undefined
	const requestedTargetGrade = element.hasAttribute('data-target-grade')
		? Number(element.getAttribute('data-target-grade'))
		: undefined
	/*
"[NIH] recommend a readability grade level of less than 7th grade for patient directed information."
https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5504936/
*/
	const defaultTargetGrade = 7
	const targetGrade = requestedTargetGrade || min(defaultTargetGrade, maxGrade || defaultTargetGrade)
	const highlightNodeType = element.hasAttribute('data-highlight-by-paragraph') ? 'ParagraphNode' : 'SentenceNode'
	const hueGreen = 120
	const hueRed = 0

	let text

	let eleReadability // Parent
	let eleDraw
	let eleTextArea
	let eleFooter
	if (element.tagName === 'TEXTAREA') {
		eleReadability = doc.createElement('div')
		element.insertAdjacentElement('beforebegin', eleReadability)
		eleTextArea = element
		eleReadability.dataset.readability = true
		text = eleTextArea.textContent
		if (!text) {
			text = element.getAttribute('data-readability')
		}

		eleTextArea.removeAttribute('data-readability')

		if (!eleTextArea.id && !eleTextArea.name) {
			eleTextArea.id = idAndName
			eleTextArea.name = idAndName
		}
	} else {
		text = element.getAttribute('data-readability')
		eleReadability = element
		eleTextArea = doc.createElement('textarea')
		eleTextArea.id = idAndName
		eleTextArea.name = idAndName
	}

	eleReadability.innerHTML = '<div class="editor"><div class="draw"></div></div><div class="footer"></div>'
	eleDraw = eleReadability.querySelector('.draw')
	eleDraw.insertAdjacentElement('afterend', eleTextArea)
	eleFooter = eleReadability.querySelector('.footer')

	eleTextArea.value = text

	const change = debounce(onChangeValue, 200)
	eleTextArea.addEventListener('input', change)
	eleTextArea.addEventListener('paste', change)
	eleTextArea.addEventListener('keyup', change)
	eleTextArea.addEventListener('mouseup', change)

	let bHighlightLinesUserPreference
	let grade
	let hTrees = render(text)
	/* eslint-disable unicorn/prefer-node-append */
	let domCreated = {
		draw: eleDraw.appendChild(createElement(hTrees.draw)),
		footer: eleFooter.appendChild(createElement(hTrees.footer))
	}
	/* eslint-enable unicorn/prefer-node-append */
	updateTextareaValidity()

	function score(text) {
		if (text) {
			const scores = readabilityScores(text)
			if (scores.letterCount) {
				const results = {
					grade: roundTo2Decimals(
						mean([
							/*
							Per Wikipedia: A 2010 study published in the Journal of the Royal College of Physicians of Edinburgh stated that
								“SMOG should be the preferred measure of readability when evaluating consumer-oriented healthcare material.”
									https://pubmed.ncbi.nlm.nih.gov/21132132/
							As this repo's original purpose was targeting public healthcare information, the SMOG score is half the weight.
							*/
							scores.smog,
							mean([
								scores.daleChall,
								scores.ari,
								scores.colemanLiau,
								scores.fleschKincaid,
								scores.gunningFog
							])
						])
					)
				}
				const weight = unlerp(targetGrade - 2, targetGrade + 4, results.grade) // If targetGrade=7, hue is Green for grade level <= 5 and Red for grade level >= 11
				results.hue = lerp(hueGreen, hueRed, min(1, max(0, weight)))

				return results
			}
		}

		return {
			grade: 0,
			hue: hueGreen
		}
	}

	function onChangeValue(/* ev */) {
		const prev = text
		const next = eleTextArea.value

		if (prev !== next) {
			text = next
			onChange()
		}
	}

	function onChangeCheckbox(ev) {
		bHighlightLinesUserPreference = ev.target.checked
		onChange()
	}

	function onChange() {
		const hTreesNext = render(text)
		domCreated.draw = patch(domCreated.draw, diff(hTrees.draw, hTreesNext.draw))
		domCreated.footer = patch(domCreated.footer, diff(hTrees.footer, hTreesNext.footer))
		updateTextareaValidity()
		hTrees = hTreesNext
	}

	function updateTextareaValidity() {
		eleTextArea.setCustomValidity(
			grade > maxGrade ? 'Readability grade must be less than or equal to ' + maxGrade + '.' : ''
		)
	}

	function render(text) {
		const nodeTree = processor.runSync(processor.parse(text))
		let key = 0

		setTimeout(resize, 4)

		const textResults = score(text)
		grade = textResults.grade
		const highlightHue = highlight(textResults.hue)

		// Set bHighlightLines before calling all(nodeTree)
		const bHighlightLines =
			bHighlightLinesUserPreference === undefined ? grade > targetGrade : bHighlightLinesUserPreference

		return {
			draw: h('div', pad(all(nodeTree))),
			footer: h('div', [
				'Grade Level = ',
				h('span', xtend({ key: 'grade' }, highlightHue), grade),
				requestedTargetGrade
					? [
							';',
							h(
								'span',
								xtend({ key: 'target', className: 'ml' }, grade > targetGrade ? highlightHue : {}),
								'Target = ' + targetGrade
							)
					  ]
					: '',
				maxGrade
					? [
							';',
							h(
								'span',
								xtend({ key: 'max', className: 'ml' }, grade > maxGrade ? highlightHue : {}),
								'Max = ' + maxGrade
							)
					  ]
					: '',
				h('label', { key: 'label', className: 'ml' }, [
					h('input', {
						key: 'check',
						type: 'checkbox',
						onchange: onChangeCheckbox,
						checked: bHighlightLines
					}),
					'Highlight lines'
				])
			])
		}

		function all(node) {
			const children = node.children
			const length = children.length
			let index = -1
			let results = []

			while (++index < length) {
				results = results.concat(one(children[index]))
			}

			return results
		}

		function one(node) {
			let result = 'value' in node ? node.value : all(node)
			if (node.type === highlightNodeType) {
				const id = idAndName + '-' + ++key // ID will be unique for the page, so could also be added as the element's id
				if (bHighlightLines) {
					const attrs = highlight(score(processor.stringify(node)).hue)
					result = h('span', xtend({ key: id }, attrs), result)
				}
			}

			return result
		}

		// Trailing white-space in a `textarea` is shown, but not in a `div` with
		// `white-space: pre-wrap`.
		// Add a `br` to make the last newline explicit.
		function pad(nodes) {
			var tail = nodes[nodes.length - 1]

			if (typeof tail === 'string' && tail.charAt(tail.length - 1) === '\n') {
				nodes.push(h('br', { key: 'break' }))
			}

			return nodes
		}
	}

	function rows(node) {
		if (!node) {
			return
		}

		return ceil(node.getBoundingClientRect().height / parseInt(win.getComputedStyle(node).lineHeight, 10)) + 1
	}

	function resize() {
		eleTextArea.rows = rows(eleDraw)
	}
}
