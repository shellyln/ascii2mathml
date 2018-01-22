// Examples

var parser = new DOMParser();
var testCases = document.querySelectorAll(".examples li");
Array.prototype.forEach.call(testCases, function (test) {
  var code = test.querySelector("code");
  var ascii = code.firstChild ? code.firstChild.textContent : "";
  var options = Object.assign({display: "block"}, code.dataset);
  var mathml = ascii2mathml(ascii, options);
  var math = parser.parseFromString(mathml, "text/html").querySelector("math");
  test.appendChild(math);
});


// Try

var tryInput = document.getElementById("try-input"),
    tryDisplay = document.getElementById("try-display"),
    tryDir = document.getElementById("try-dir"),
    tryOutput = document.getElementById("try-output"),
    tryAnnotate = document.getElementById("try-annotate"),
    tryDecimalMark = document.getElementById("try-decimalmark"),
    tryColSep = document.getElementById("try-colsep"),
    tryRowSep = document.getElementById("try-rowsep"),
    outputRender = new CustomEvent("render", {
      bubbles: true,
      cancelable: true
    });

document.addEventListener("DOMContentLoaded", renderTryBox);
tryInput.addEventListener("input", renderTryBox);
[tryDisplay, tryDir, tryAnnotate].forEach(function(el) {
  el.addEventListener("change", renderTryBox);
});

function renderTryBox(event) {
  var options = {};
  if (tryDisplay.checked) options.display = "block";
  if (tryDir.checked) options.dir = "rtl";
  if (tryAnnotate.checked) options.annotate = "true";
  options.decimalMark = tryDecimalMark.value || '.';
  options.colSep = tryColSep.value || ',';
  options.rowSep = tryRowSep.value || ';';
  var ascii = tryInput.value,
      mathml = ascii2mathml(ascii, options);
  tryOutput.innerHTML = mathml;
  tryOutput.dispatchEvent(outputRender);

  if (mathml === '<math display="block"><munder><mover>' +
      '<munder><mfenced open="" close=""><munder>' +
      '<mtext>Ascii</mtext><mn>2</mn></munder></mfenced>' +
      '<mtext>MathML</mtext></munder><mo accent="true">‾</mo>' +
      '</mover><mo>_</mo></munder></math>' ||
      mathml === '<math display="block"><mover><munder>' +
      '<munder><mfenced open="" close=""><munder>' +
      '<mtext>Ascii</mtext><mn>2</mn></munder></mfenced>' +
      '<mtext>MathML</mtext></munder><mo>_</mo></munder>' +
      '<mo accent="true">‾</mo></mover></math>') {
    // Easter egg -- This displays the logo
    tryOutput.classList.add('logo');
  } else {
    tryOutput.classList.remove('logo');
  }
}

document.addEventListener("DOMContentLoaded", function() {
  if (!window.location.hash) {
    // Focus the main try textbox
    tryInput.focus();
  }
  var initEq = tryInput.value;
  tryInput.value = "";
  tryInput.value = initEq;

  // Prepare MathJax if the users wants it
  var documentHead = document.getElementsByTagName("head")[0];
  var mathJaxScript = document.createElement("script"),
      useMathJax = document.getElementById("use-mathjax");

  useMathJax.addEventListener("change", function(event) {
    if (useMathJax.checked && !documentHead.contains(mathJaxScript)) {
      mathJaxScript.type = "text/javascript";
      mathJaxScript.src  = "https://cdn.mathjax.org/mathjax/latest/MathJax.js?config=MML_HTMLorMML";
      documentHead.appendChild(mathJaxScript);
    }

    if (useMathJax.checked && documentHead.contains(mathJaxScript)) {
      // Render using mathjax
      tryOutput.addEventListener("render", renderMathJax);
      renderTryBox();
    }
    if (!useMathJax.checked) {
      // Stop rendering with mathJax
      tryOutput.removeEventListener("render", renderMathJax);
      renderTryBox();
    }
  });

  function renderMathJax(evt) {
    MathJax.Hub.Queue(["Typeset", MathJax.Hub, tryOutput]);
    console.log("MathJaxing...");
  };
});
