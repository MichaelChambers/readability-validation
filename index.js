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
	background-color: #fff;
}

[data-readability] .editor {
	position: relative;
	max-width: 100%;
	overflow: hidden;
	background-color: #fff;
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
	min-height: 62px;
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
[data-readability] .footer input {
	margin-right: 0.2em;
	vertical-align: -1px;
}
`

function roundTo2Decimals(n) {
	return round((n + Number.EPSILON) * 100) / 100
}

function highlight(hue) {
	return {
		style: {
			backgroundColor: 'hsl(' + [hue, '93%', '85%'].join(', ') + ')'
		}
	}
}

const processor = unified().use(english).use(stringify)

const dataReadability = 'data-readability' // Value used as initial text unless element is textarea and has textContent
const dataName = 'data-name' // Value used for textarea name and as base for score input's name, but does not override any existing name
const dataMaxGrade = 'data-max-grade'
const dataTargetGrade = 'data-target-grade'
const dataHighlightByParagraph = 'data-highlight-by-paragraph' // Value ignored, evaluated as true if attribute exists
const dataNativeFormValidation = 'data-native-form-validation' // Value ignored, evaluated as true if attribute exists
const dataPopoverToggle = 'data-popover-toggle' // Populates data-toggle value for popovers

// Any attributes on the data-readability elements are preferred over values from the optional global config, below.
const config = win.globalReadabilityConfig || {
	name: undefined,
	maxGrade: undefined,
	targetGrade: undefined,
	highlightByParagraph: undefined,
	nativeFormValidation: undefined,
	popoverToggle: undefined
}

const aReadability = doc.querySelectorAll('[' + dataReadability + ']')

if (aReadability.length > 0) {
	const style = doc.createElement('style')
	style.textContent = styleContent
	doc.head.append(style)
	for (const element of aReadability) {
		plugReadability(element)
	}
}

function plugReadability(element) {
	const name = element.hasAttribute(dataName)
		? element.getAttribute(dataName)
		: (['TEXTAREA', 'INPUT'].includes(element.tagName) && element.name) || config.name || ''
	const nameGrade = name && name + 'Grade'
	const maxGrade = element.hasAttribute(dataMaxGrade)
		? Number(element.getAttribute(dataMaxGrade))
		: config.maxGrade
		? Number(config.maxGrade)
		: undefined
	const requestedTargetGrade = element.hasAttribute(dataTargetGrade)
		? Number(element.getAttribute(dataTargetGrade))
		: config.targetGrade
		? Number(config.targetGrade)
		: undefined
	/*
"[NIH] recommend a readability grade level of less than 7th grade for patient directed information."
https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5504936/
*/
	const defaultTargetGrade = 7
	const targetGrade = requestedTargetGrade || maxGrade || defaultTargetGrade
	const highlightNodeType =
		element.hasAttribute(dataHighlightByParagraph) || config.highlightByParagraph ? 'ParagraphNode' : 'SentenceNode'
	const bNativeFormValidation = element.hasAttribute(dataNativeFormValidation) || config.nativeFormValidation
	const popover = element.hasAttribute(dataPopoverToggle)
		? element.getAttribute(dataPopoverToggle)
		: config.popoverToggle || 'popover'

	// Grade/Hue range: Target is 1/3 from TooEasy to TooHard (in grade level and in hue)
	const tooHardGrade = max(targetGrade + 4, maxGrade || targetGrade) // Default = 11
	const tooEasyGrade = targetGrade - (tooHardGrade - targetGrade) / 2 // Default = 5
	const tooEasyHue = 180 // Teal
	// TargetHue = 120 = Green
	// HardHue = 60 = Yellow
	const tooHardHue = 0 // Red

	let text
	let eleReadability
	let eleDraw
	let eleTextArea
	let eleFooter

	setElements(element)

	let bHighlightLinesUserPreference
	let grade
	let hTrees = render(text)
	let domCreated = {
		draw: eleDraw.appendChild(createElement(hTrees.draw)),
		footer: eleFooter.appendChild(createElement(hTrees.footer))
	}
	updateTextareaValidity()

	function setElements(element) {
		const bIsTextArea = element.tagName === 'TEXTAREA'
		const bIsInput = element.tagName === 'INPUT'

		// Set the eleReadability [data-readability] root
		if (bIsTextArea || bIsInput) {
			eleReadability = doc.createElement('div')
			element.before(eleReadability)
			text = element.value
			if (!text) {
				text = element.getAttribute(dataReadability)
			}

			element.removeAttribute(dataReadability)
		} else {
			eleReadability = element
			text = eleReadability.getAttribute(dataReadability)
		}

		// Set the eleTextArea
		if (bIsTextArea) {
			eleTextArea = element
			if (name && !eleTextArea.name) {
				eleTextArea.name = name
			}
		} else {
			eleTextArea = doc.createElement('textarea')
			if (name) {
				eleTextArea.name = name
			}

			if (bIsInput) {
				// Copy class and most attributes from Input to new Textarea, then delete the Input.
				for (const attName of element.getAttributeNames()) {
					if (!['name', 'type', 'value', 'size'].includes(attName)) {
						eleTextArea.setAttribute(attName, element.getAttribute(attName))
					}
				}

				element.remove()
			}
		}

		eleReadability.setAttribute(dataReadability, '')

		eleReadability.innerHTML = '<div class="editor"><div class="draw"></div></div><div class="footer"></div>'
		eleDraw = eleReadability.querySelector('.draw')
		eleDraw.after(eleTextArea)
		eleFooter = eleReadability.querySelector('.footer')

		eleTextArea.value = text

		const change = debounce(onChangeValue, 200)
		eleTextArea.addEventListener('input', change)
		eleTextArea.addEventListener('paste', change)
		eleTextArea.addEventListener('keyup', change)
		eleTextArea.addEventListener('mouseup', change)
	}

	function score(text) {
		const results = {
			scores: Boolean(text) && readabilityScores(text),
			grade: 0,
			hue: tooEasyHue
		}
		const scores = results.scores
		if (Boolean(scores) && scores.letterCount) {
			results.grade = roundTo2Decimals(
				mean([
					/*
					Per Wikipedia: A 2010 study published in the Journal of the Royal College of Physicians of Edinburgh stated that
						“SMOG should be the preferred measure of readability when evaluating consumer-oriented healthcare material.”
							https://pubmed.ncbi.nlm.nih.gov/21132132/
					As this repo's original purpose was targeting public healthcare information, the SMOG score is 3/8 the weight.
					*/
					scores.smog,
					scores.smog,
					scores.smog,
					scores.daleChall,
					scores.ari,
					scores.colemanLiau,
					scores.fleschKincaid,
					scores.gunningFog
				])
			)
			const weight = unlerp(tooEasyGrade, tooHardGrade, results.grade)
			results.hue = lerp(tooEasyHue, tooHardHue, min(1, max(0, weight)))
		}

		return results
	}

	function onChangeValue(/* ev */) {
		const previous = text
		const next = eleTextArea.value

		if (previous !== next) {
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
		if (bNativeFormValidation) {
			eleTextArea.setCustomValidity(
				grade > maxGrade ? 'Readability grade must be less than or equal to ' + maxGrade + '.' : ''
			)
		}
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

		const scores = textResults.scores
		const sResultsHTML =
			'<dl>' +
			'<dt>Simple Measure of Gobbledygook</dt><dd>' +
			(scores.smog || 0) +
			'</dd>' +
			'<dt>Automated Readability</dt><dd>' +
			(scores.ari || 0) +
			'</dd>' +
			'<dt>Coleman-Liau</dt><dd>' +
			(scores.colemanLiau || 0) +
			'</dd>' +
			'<dt>Dale-Chall</dt><dd>' +
			(scores.daleChall || 0) +
			'</dd>' +
			'<dt>Flesch-Kincaid</dt><dd>' +
			(scores.fleschKincaid || 0) +
			'</dd>' +
			'<dt>Gunning Fog</dt><dd>' +
			(scores.gunningFog || 0) +
			'</dd>' +
			'</dl>'

		return {
			draw: h('div', pad(all(nodeTree))),
			footer: h('div', [
				h(
					'a',
					{
						key: 'results',
						dataset: {
							content: sResultsHTML,
							html: 'true',
							toggle: popover,
							placement: 'auto',
							trigger: 'click hover focus'
						},
						attributes: {
							rel: 'popover',
							role: 'status',
							'aria-label': 'Detailed Results',
							title: 'Detailed Results',
							href: '#'
						}
					},
					[
						'Grade Level = ',
						h('span', xtend({ key: 'grade', attributes: { role: 'status' } }, highlightHue), grade)
					]
				),
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
				]),
				h(
					'div',
					{ key: 'screenReaderStatus', className: 'sr-only', attributes: { role: 'status' } },
					grade > maxGrade
						? 'Error: text exceeds maximum readability.'
						: requestedTargetGrade && grade > targetGrade
						? 'Warning: text exceeds target readability.'
						: ''
				),
				nameGrade ? h('input', { key: nameGrade, name: nameGrade, type: 'hidden', value: grade }) : ''
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
				const id = name + '-' + ++key
				if (bHighlightLines) {
					const scores = score(processor.stringify(node))
					result = h(
						'span',
						xtend({ key: id, attributes: { 'data-grade': scores.grade } }, highlight(scores.hue)),
						result
					)
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
