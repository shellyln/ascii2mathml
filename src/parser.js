import syntax from "./syntax";
import {numbers, identifiers, operators, groupings, accents} from "./lexicon";


function tag(tagname) {
  return function fn(content, attr) {
    if (typeof content === "object") {
      // Curry
      return function(str) { return fn(str, content); };
    }

    if (typeof attr !== "object") {
      return `<${tagname}>${content}</${tagname}>`;

    } else {

      let attrstr = Object.keys(attr).map(function(key) {
        return `${key}="${attr[key]}"`;
      }).join(" ");

      return `<${tagname} ${attrstr}>${content}</${tagname}>`;
    }
  };
}

const mi = tag("mi"),
      mn = tag("mn"),
      mo = tag("mo"),
      mfrac = tag("mfrac"),
      msup = tag("msup"),
      msub = tag("msub"),
      msubsup = tag("msubsup"),
      munder = tag("munder"),
      mover = tag("mover"),
      munderover = tag("munderover"),
      menclose = tag("menclose"),
      mrow = tag("mrow"),
      msqrt = tag("msqrt"),
      mroot = tag("mroot"),
      mfenced = tag("mfenced"),
      mtable = tag("mtable"),
      mtr = tag("mtr"),
      mtd = tag("mtd");

function parser(options) {

  const decimalMarkRE = options.decimalMark === "." ? "\\." :
          options.decimalMark,
        numberRegexp = new RegExp(
          `^${numbers.digitRange}+(${decimalMarkRE}${numbers.digitRange}+)?`
        ),
        colsplit = splitby(options.colSep),
        rowsplit = splitby(options.rowSep),
        newlinesplit = splitby("\n");

  function splitby(sep) {
    return function(str) {
      let split = [],
          inners = 0,
          index = 0;

      for (let i = 0; i < str.length; i += 1) {
        let rest = str.slice(i),
            char = str[i];
        if (rest.startsWith(sep) &&
            !str.slice(0, i).match(/\\(\\{2})*$/)) {
          if (inners === 0) {
            split.push(str.slice(index, i));
            index = i + sep.length;
          }
        } else if (char.match(groupings.open.regexp)) {
          inners += 1;
        } else if (char.match(groupings.close.regexp)) {
          inners -= 1;
        }
      }

      split.push(str.slice(index));

      return split;
    };
  }


  const parse = function parse(ascii, mathml, space, grouped) {

    if (!ascii) { return mathml; }

    if (ascii.match(/^\s/)) {
      // Dont include the space it if there is a binary infix becoming
      // a prefix
      if (ascii.match(/^\s+(\/[^\/]|^[^\^]|_[^_|])/)) {
        return parse(ascii.trim(), mathml, true);
      }

      // Count the number of leading spaces
      let spaces = ascii.match(/^ +/),
          spacecount = spaces ? spaces[0].length : 0;

      if (spacecount > 1) {
        // spacewidth is a linear function of spacecount
        let spaceel = `<mspace width="${spacecount - 1}ex" />`;

        return parse(ascii.trim(), mathml + spaceel, true);
      }

      return parse(ascii.trim(), mathml, true);
    }


    let [el, rest] = parseone(ascii, grouped);

    // ## Binary infixes ##

    // ### Fraction ###
    if ((rest &&
         rest.trimLeft().startsWith("/") ||
         rest.trimLeft().startsWith("./")) &&
        !rest.trimLeft().match(/^\.?\/\//)) {

      [el, rest] = splitNextFraction(el, rest);
    }


    return parse(rest, mathml + el, false);
  };

  function parsegroup(ascii) {
    // Takes one asciiMath string and returns mathml in one group
    if (ascii.trim().length === 0) { return ""; }
    let mathml = parse(ascii, "", false, true);

    return mathml === getlastel(mathml) ? mathml : mrow(mathml);
  }


  function parseone(ascii, grouped, lastel) {
    /**
     Return a split of the first element parsed to MathML and the rest
     of the string unparsed.
     */

    // TODO: split this up into smaller more readable code

    if (!ascii) { return ["", ""]; }

    let el, rest;

    let head = ascii[0],
        tail = ascii.slice(1),
        nextsymbol = head + (tail.match(/^[A-Za-z]+/) || "");


    if (ascii.startsWith("sqrt")) {
      // ## Roots ##

      let split = parseone(ascii.slice(4).trim(), grouped);

      el = msqrt(split[0] ? removeSurroundingBrackets(split[0]) : mrow(""));
      rest = split[1];

    } else if (ascii.startsWith("root")) {

      let one = parseone(ascii.slice(4).trimLeft(), grouped),
          index = one[0] ? removeSurroundingBrackets(one[0]) : mrow(""),
          two = parseone(one[1].trimLeft(), grouped),
          base = two[0] ? removeSurroundingBrackets(two[0]) : mrow("");

      el = mroot(base + index);
      rest = two[1];

    } else if (head === "\\" && ascii.length > 1) {
      // ## Forced opperator ##

      if (ascii[1].match(/[(\[]/)) {
        let stop = findmatching(tail);
        el = mo(ascii.slice(2, stop));
        rest = ascii.slice(stop + 1);
      } else {
        el = mo(ascii[1]);
        rest = ascii.slice(2);
      }

    } else if (accents.contains(nextsymbol)) {

      // ## Accents ##

      let accent = accents.get(nextsymbol),
          next = ascii.slice(nextsymbol.length).trimLeft(),
          ijmatch = next.match(/^\s*\(?([ij])\)?/),
          split = parseone(next);

      switch (accent.type) {
        // ## Accents on top ##
        case "over":
          if (ijmatch) {
            // use non-dotted i and j glyphs as to not clutter
            el = mover(mi(ijmatch[1] === "i" ? "ı" : "ȷ") +
                       mo(accent.accent, {accent: true}));
            rest = next.slice(ijmatch[0].length);
          } else {
            el = mover(removeSurroundingBrackets(split[0])
                        + mo(accent.accent, {accent: true}));
            rest = split[1];
          }
          break;
        // ## Accents below ##
        case "under":
          el = munder(removeSurroundingBrackets(split[0]) + mo(accent.accent));
          rest = split[1];
          break;
        // ## Enclosings
        case "enclose":
          el = menclose(removeSurroundingBrackets(split[0]), accent.attrs);
          rest = split[1];
          break;
        default:
          throw new Error("Invalid config for accent " + nextsymbol);
      }

    } else if (syntax.isfontCommand(ascii)) {

      // ## Font Commands ##

      let split = syntax.splitfont(ascii);

      el = tag(split.tagname)(split.text,
                              split.font && {mathvariant: split.font});
      rest = split.rest;

    } else if (groupings.complex.contains(nextsymbol)) {

      // ## Complex groupings ##

      let grouping = groupings.complex.get(nextsymbol),
          next = ascii.slice(nextsymbol.length).trimLeft(),
          split = parseone(next);

      el = mfenced(removeSurroundingBrackets(split[0]), grouping);
      rest = split[1];

    } else if (syntax.isgroupStart(ascii) || syntax.isvertGroupStart(ascii)) {

      // ## Groupings ##

      let [, open, group, close, after] = syntax.isgroupStart(ascii) ?
            syntax.splitNextGroup(ascii) :
            syntax.splitNextVert(ascii);

      rest = groupings.open.get(after);
      let rows = (function() {
        let lines = newlinesplit(group);
        return lines.length > 1 ? lines : rowsplit(group);
      }());

      if (syntax.ismatrixInterior(group.trim(),
                                  options.colSep,
                                  options.rowSep)) {

        // ### Matrix ##

        if (group.trim().endsWith(options.colSep)) {
          // trailing row break
          group = group.trimRight().slice(0, -1);
        }

        let cases = open === "{" && close === "",
            table = parsetable(group, cases && {columnalign: "center left"});

        el = mfenced(table, {open: open, close: close});

      } else if (rows.length > 1) {

        // ### Column vector ###

        if (rows.length === 2 && open === "(" && close === ")") {

          // #### Binomial Coefficient ####

          // Experimenting with the binomial coefficient
          // Perhaps I'll remove this later
          let binom = mfrac(rows.map(parsegroup).join(""), {
            linethickness: 0
          });

          el = mfenced(binom, {open: open, close: close});

        } else {

          // #### Single column vector ####

          let vector = rows.map(colsplit);

          if (last(vector).length === 1 && last(vector)[0].match(/^\s*$/)) {
            // A trailing rowbreak
            vector = vector.slice(0, -1);
          }

          let matrix = vector.map(function(row) {
            return mtr(row.map(compose(mtd, parsegroup)).join(""));
          }).join("");

          el = mfenced(mtable(matrix), {open: open, close: close});
        }

      } else {

        // ### A fenced group ###

        let cols = colsplit(group),
            els = cols.map(parsegroup).join(""),
            attrs = {open: open, close: close};

        if (options.colSep !== ",") { attrs.separators = options.colSep; }
        el = mfenced(els, attrs);
      }

    } else if (!grouped && syntax.isgroupable(ascii, options)) {

      // ## Whitespace ##

      // treat whitespace separated subexpressions as a group
      let split = splitNextWhitespace(ascii);

      el = parsegroup(split[0]);
      rest = split[1];

    } else if (numbers.isdigit(head)) {

      // ## Number ##

      let number = ascii.match(numberRegexp)[0];

      el = mn(number);
      rest = tail.slice(number.length - 1);

    } else if (ascii.match(/^#`[^`]+`/)) {

      // ## Forced number ##

      let number = ascii.match(/^#`([^`]+)`/)[1];
      el = mn(number);
      rest = ascii.slice(number.length + 3);

    } else if (ascii.match(new RegExp("^" + operators.regexp.source)) &&
               !identifiers.contains(nextsymbol)) {

      // ## Operators ##

      let [op, next] = syntax.splitNextOperator(ascii),
          derivative = ascii.startsWith("'"),
          prefix = contains(["∂", "∇"], op),
          stretchy = contains(["|"], op),
          mid = ascii.startsWith("| "),
          attr = {};
      if (derivative) { attr.lspace = 0; attr.rspace = 0; }
      if (prefix) { attr.rspace = 0; }
      if (stretchy) { attr.stretchy = true; }
      if (mid) {
        attr.lspace = "veryverythickmathspace";
        attr.rspace = "veryverythickmathspace";
      }

      el = mo(op, !isempty(attr) && attr);
      rest = next;

    } else if (identifiers.contains(nextsymbol)) {

      // Perhaps a special identifier character
      let ident = identifiers[nextsymbol];

      // Uppercase greeks are roman font variant
      let uppercase = ident.match(
          /[\u0391-\u03A9\u2100-\u214F\u2200-\u22FF]/
      );
      el = uppercase ? mi(ident, {mathvariant: "normal"}) : mi(ident);
      rest = tail.slice(nextsymbol.length - 1);

    } else if (head === "O" && tail[0] === "/") {
      // The special case of the empty set. I suppose there is no
      // dividing by the latin capital letter O
      el = mi(identifiers["O/"], {mathvariant: "normal"});
      rest = tail.slice(1);

    } else {
      el = mi(head);
      rest = tail;
    }


    if (rest && rest.trimLeft().match(/\.?[\^_]/)) {

      if ((lastel ? !lastel.match(/m(sup|over)/) : true) &&
          rest.trim().startsWith("_") &&
          (rest.trim().length <= 1 || !rest.trim()[1].match(/[|_]/))) {

        // ### Subscript ###
        [el, rest] = splitNextSubscript(el, rest);

      } else if (lastel !== "mover" && rest.trim().startsWith("._") &&
                 (rest.trim().length <= 2 || !rest.trim()[2].match(/[|_]/))) {

        // ### Underscript ###
        [el, rest] = splitNextUnderscript(el, rest);

      } else if ((lastel ? !lastel.match(/m(sub|under)/) : true) &&
                 rest.trim().startsWith("^") &&
                 (rest.trim().length <= 1 || rest.trim()[1] !== "^")) {

        // ### Superscript ###
        [el, rest] = splitNextSuperscript(el, rest);

      } else if (lastel !== "munder" && rest.trim().startsWith(".^") &&
                 (rest.trim().length <= 2 || rest.trim()[2] !== "^")) {

        // ### Overscript ###
        [el, rest] = splitNextOverscript(el, rest);
      }
    }

    return [el, rest];
  }


  function splitNextSubscript(el, rest) {
    let next = parseone(rest.trim().slice(1).trim(), true, "msub"),
        sub = next[0] ? removeSurroundingBrackets(next[0]) : mrow("");
    let ml,
        ascii = next[1];

    // ### Supersubscript ###
    if (ascii && ascii.trim().startsWith("^") &&
        (ascii.trim().length <= 1 || !ascii.trim()[1] !== "^")) {
      let next2 = parseone(ascii.trim().slice(1).trim(), true),
          sup = next2[0] ? removeSurroundingBrackets(next2[0]) : mrow(""),
          tagfun = syntax.shouldGoUnder(el) ? munderover : msubsup;
      ml = tagfun(el + sub + sup);
      ascii = next2[1];
    } else {
      let tagfun = syntax.shouldGoUnder(el) ? munder : msub;
      ml = tagfun(el + sub);
    }

    return [ml, ascii];
  }

  function splitNextSuperscript(el, rest) {
    let next = parseone(rest.trim().slice(1).trim(), true, "msup"),
        sup = next[0] ? removeSurroundingBrackets(next[0]) : mrow("");
    let ml,
        ascii = next[1];

    // ### Super- subscript ###
    if (ascii.trim().startsWith("_") &&
        (ascii.trim().length <= 1 || !ascii.trim()[1].match(/[|_]/))) {
      let next2 = parseone(ascii.trim().slice(1).trim(), true),
          sub = next2[0] ? removeSurroundingBrackets(next2[0]) : mrow(""),
          tagfun = syntax.shouldGoUnder(el) ? munderover : msubsup;
      ml = tagfun(el + sub + sup);
      ascii = next2[1];
    } else {
      let tagfun = syntax.shouldGoUnder(el) ? mover : msup;
      ml = tagfun(el + sup);
    }

    return [ml, ascii];
  }


  function splitNextUnderscript(el, rest) {
    let next = parseone(rest.trim().slice(2).trim(), true, "munder"),
        under = next[0] ? removeSurroundingBrackets(next[0]) : mrow("");
    let ml,
        ascii = next[1];

    // ### Under- overscript ###
    let overmatch = ascii.match(/^(\.?\^)[^\^]/);
    if (overmatch) {
      let next2 = parseone(ascii.trim().slice(overmatch[1].length).trim(),
                           true),
          over = next2[0] ? removeSurroundingBrackets(next2[0]) : mrow("");
      ml = munderover(el + under + over);
      ascii = next2[1];
    } else {
      ml = munder(el + under);
    }

    return [ml, ascii];
  }

  function splitNextOverscript(el, rest) {
    let next = parseone(rest.trim().slice(2).trim(), true, "mover"),
        over = next[0] ? removeSurroundingBrackets(next[0]) : mrow("");
    let ml,
        ascii = next[1];

    // ### Under- overscript ###
    let undermatch = ascii.match(/^(\.?_)[^_|]/);
    if (undermatch) {
      let next2 = parseone(ascii.trim().slice(undermatch[1].length).trim(),
                           true),
          under = next2[0] ? removeSurroundingBrackets(next2[0]) : mrow("");
      ml = munderover(el + under + over);
      ascii = next2[1];
    } else {
      ml = mover(el + over);
    }

    return [ml, ascii];
  }


  function splitNextFraction(el, rest) {
    let bevelled = rest.trim().startsWith("./"),
        rem = rest.trim().slice(bevelled ? 2 : 1);
    let next,
        ml,
        ascii;
    if (rem.startsWith(" ")) {
      let split = rem.trim().split(" ");
      next = parsegroup(split[0]);
      ascii = rem.trimLeft().slice(split[0].length + 1);
    } else {
      [next, ascii] = parseone(rem);
    }
    next = next || mrow("");
    ml = mfrac(removeSurroundingBrackets(el) +
               removeSurroundingBrackets(next),
               bevelled && {bevelled: true});

    if (ascii && ascii.trim().startsWith("/") ||
        ascii.trim().startsWith("./")) {
      return splitNextFraction(ml, ascii);
    }
    return [ml, ascii];
  }


  function splitNextWhitespace(str) {
    const re = new RegExp(`(\\s|${options.colSep}|${options.rowSep}|$)`);
    let match = str.match(re),
        head = str.slice(0, match.index),
        sep = match[0],
        tail = str.slice(match.index + 1);

    let next = head,
        rest = sep + tail;

    if (!syntax.isgroupStart(tail.trim()) && syntax.endsInFunc(head)) {
      let newsplit = splitNextWhitespace(tail);
      next += sep + newsplit[0];
      rest = newsplit[1];
    } else if (head.match(/root$/)) {
      let split1 = splitNextWhitespace(tail),
          split2 = splitNextWhitespace(split1[1].trimLeft());
      next += sep + split1[0] + " " + split2[0];
      rest = sep + split2[1];
    }
    return [next, rest];
  }


  function parsetable(matrix, attrs) {
    let rows = (function() {
      let lines = colsplit(matrix);
      return lines.length > 1 ? lines : newlinesplit(matrix);
    }()).map(function(el) {
      return el.trim().slice(1, -1);
    });

    return mtable(rows.map(parserow).join(""), attrs);
  }

  function parserow(row, acc) {
    acc = typeof acc === "string" ? acc : "";
    if (!row || row.length === 0) {
      return mtr(acc);
    }

    let [mathml, rest] = parsecell(row.trim(), "");
    return parserow(rest.trim(), acc + mathml);
  }

  function parsecell(cell, acc) {
    if (!cell || cell.length === 0) {
      return [mtd(acc), ""];
    }
    if (cell[0] === options.colSep) {
      return [mtd(acc), cell.slice(1).trim()];
    }

    let [mathml, rest] = parseone(cell);
    return parsecell(rest.trim(), acc + mathml);
  }

  return parse;
}


function splitlast(mathml) {
  /**
   Return a pair of all but last eliment and the last eliment
   */
  let lastel = getlastel(mathml),
      prewels = mathml.slice(0, mathml.lastIndexOf(lastel));

  return [prewels, lastel];
}


function removeSurroundingBrackets(mathml) {
  let inside = mathml.replace(/^<mfenced[^>]*>/, "")
        .replace(/<\/mfenced>$/, "");
  if (splitlast(inside)[1] === inside) {
    return inside;
  } else {
    return mrow(inside);
  }
}


function getlastel(xmlstr) {
  // This breaks the linearity of the implimentation
  // optimation possible, perhaps an XML parser
  let tagmatch = xmlstr.match(/<\/(m[a-z]+)>$/);
  if (!tagmatch) {
    let spacematch = xmlstr.match(/<mspace\s*([a-z]+="[a-z]")*\s*\?>/);
    if (spacematch) {
      let i = spacematch.match[0].length;
      return xmlstr.slice(i);
    } else {
      return "";
    }
  }

  let tagname = tagmatch[1];

  let i = xmlstr.length - (tagname.length + 3),
      inners = 0;
  for (i; i >= 0; i -= 1) {
    if (xmlstr.slice(i).startsWith(`<${tagname}`)) {
      if (inners === 0) {
        break;
      }
      inners -= 1;
    }
    if (xmlstr.slice(i - 2).startsWith(`</${tagname}`)) {
      inners += 1;
    }
  }

  return xmlstr.slice(i);
}


function findmatching(str) {
  let open = str[0],
      close = open === "(" ? ")" :
        open === "[" ? "]" :
        str[0];

  let inners = 0,
      index = 0;
  for (let i = 0; i < str.length; i += 1) {
    let char = str[i];
    index += 1;
    if (char === close) {
      inners -= 1;
      if (inners === 0) {
        break;
      }
    } else if (char === open) {
      inners += 1;
    }
  }
  return index;
}

function isempty(obj) {
  return Object.keys(obj).length === 0;
}

function contains(arr, el) {
  return arr.indexOf(el) >= 0;
}

function last(arr) {
  return arr.slice(-1)[0];
}

function compose(f, g) {
  return function(x) { return f(g(x)); };
}

parser.getlastel = getlastel;


export default parser;
