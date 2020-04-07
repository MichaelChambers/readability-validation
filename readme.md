# Readability

*   Add readability-validation.min.js to any web page.
*   On any existing textareas you want scored and/or validated,
    add the data-readability attribute.
*   Or use one or more empty divs and add the data-readability attribute
    and set the attribute’s value to any initial text.
*   Highlighted per-sentence difficulty feedback displays when the text’s
    full score is over the target grade level.
*   The user can turn the difficulty highlighting on or off
    to override the default overall score based auto-toggling.
*   Scoring prefers SMOG, as this repo’s original purpose was
    validating public healthcare information.

## Optional attributes:

*   data-max-grade: blocks form submission if the text’s
    grade is greater than max-grade.  Default = none
*   data-target-grade: determines the highlighted color feedback.
    Target-2 = Green, Target+4 = Red.  Default = min(max-grade, 7)
*   data-highlight-by-paragraph: if set to true, highlighted text
    feedback is per paragraph instead of per sentence.  Default = false
*   data-id-and-name: populates the id and name for the generated textarea,
    or adds them to an existing textarea if it doesn’t already have values.
    Default = “readability#”

## Related

*   [readability](https://github.com/wooorm/readability)
*   [readability-scores](https://github.com/MichaelChambers/readability-scores)
