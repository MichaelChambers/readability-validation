# Readability

*   Add readability-validation.min.js to any web page.
*   On any existing textareas you want scored and/or validated,
    add the data-readability attribute.
*   Or use one or more empty divs and add the data-readability attribute
    and set the attribute’s value to any initial text.
*   Highlighted per-sentence difficulty feedback automatically displays when
    the text’s full score is over the target grade level.
*   The user can turn the difficulty highlighting on or off
    to override the default overall score-based auto-toggling.
*   Scoring prefers SMOG, as this repo’s original purpose was
    validating public healthcare information.

## Optional attributes:

*   data-target-grade: determines the highlighted color feedback.
    Target-2 = Green, Target+4 = Red.  Default = min(data-max-grade, 7)
*   data-max-grade: indicates if the text’s grade is above a
    maximum allowed score.  Default = none
*   data-native-form-validation: if attribute exists and text’s
    grade is greater than data-max-grade, blocks form submission.
*   data-highlight-by-paragraph: if attribute exists, highlighted text
    feedback is per paragraph instead of per sentence.
*   data-name: used as the name for the textarea and the nameGrade
    hidden input with the score.  Does not override an existing textarea name.

## Related

*   [readability](https://github.com/wooorm/readability)
*   [readability-scores](https://github.com/MichaelChambers/readability-scores)
