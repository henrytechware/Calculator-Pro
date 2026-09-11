(function(){
"use strict";

var tokens = [];
var justEvaluated = false;
var lastResultValue = 0;
var memoryValue = null;
var angleMode = "DEG";
var useThousands = true;
var theme = "light";
var history = [];

var FUNC_NAMES = ["sin","cos","tan","asin","acos","atan","log","ln","sqrt","abs","floor","ceil"];
var FUNC_LABELS = {sin:"sin",cos:"cos",tan:"tan",asin:"sin⁻¹",acos:"cos⁻¹",atan:"tan⁻¹",log:"log",ln:"ln",sqrt:"√",abs:"abs",floor:"floor",ceil:"ceil"};
var NUM_RE = /^\d+\.?\d*$/;

function CalcError(msg){ this.message = msg || "Error"; this.name = "CalcError"; }
CalcError.prototype = Object.create(Error.prototype);

var storageOK = true;
function lsGet(key){
  try{ return localStorage.getItem(key); }catch(e){ storageOK=false; return null; }
}
function lsSet(key,val){
  try{ localStorage.setItem(key,val); }catch(e){ storageOK=false; }
}

function loadState(){
  try{
    var settingsRaw = lsGet("calcSettings");
    if(settingsRaw){
      var s = JSON.parse(settingsRaw);
      if(s.theme) theme = s.theme;
      if(s.angleMode) angleMode = s.angleMode;
      if(typeof s.useThousands === "boolean") useThousands = s.useThousands;
    }
    var memRaw = lsGet("calcMemory");
    if(memRaw !== null && memRaw !== "" && !isNaN(parseFloat(memRaw))) memoryValue = parseFloat(memRaw);
    var histRaw = lsGet("calcHistory");
    if(histRaw){
      var parsed = JSON.parse(histRaw);
      if(Array.isArray(parsed)) history = parsed;
    }
  }catch(e){}
}
function saveSettings(){ lsSet("calcSettings", JSON.stringify({theme:theme, angleMode:angleMode, useThousands:useThousands})); }
function saveMemory(){ if(memoryValue === null) lsSet("calcMemory",""); else lsSet("calcMemory", String(memoryValue)); }
function saveHistory(){ lsSet("calcHistory", JSON.stringify(history.slice(0,100))); }

function isNumberToken(t){ return typeof t === "string" && NUM_RE.test(t); }
function isTerminalLeft(t){ return isNumberToken(t) || t === ")" || t === "π" || t === "e" || t === "!" || t === "%"; }
function isPrimaryStart(t){ return isNumberToken(t) || t === "(" || t === "π" || t === "e" || FUNC_NAMES.indexOf(t) !== -1; }

function startFreshIfNeeded(clearOnNonOperator){
  if(justEvaluated){
    justEvaluated = false;
    if(clearOnNonOperator) tokens = [];
  }
}

function pressDigit(d){
  startFreshIfNeeded(true);
  var last = tokens[tokens.length-1];
  if(isNumberToken(last)) tokens[tokens.length-1] = last + d;
  else tokens.push(d);
  updateDisplay();
}

function pressDot(){
  startFreshIfNeeded(true);
  var last = tokens[tokens.length-1];
  if(isNumberToken(last)){
    if(last.indexOf(".") === -1) tokens[tokens.length-1] = last + ".";
  } else tokens.push("0.");
  updateDisplay();
}

function pressOperator(op){
  startFreshIfNeeded(false);
  var last = tokens[tokens.length-1];
  if(tokens.length === 0){
    if(op === "-" || op === "+") tokens.push(op);
    updateDisplay();
    return;
  }
  var lastIsOperator = (last==="+"||last==="-"||last==="×"||last==="÷"||last==="^"||last==="mod");
  if(lastIsOperator) tokens[tokens.length-1] = op;
  else if(last === "("){
    if(op === "-" || op === "+") tokens.push(op);
  } else tokens.push(op);
  updateDisplay();
}

function pressParen(p){
  startFreshIfNeeded(true);
  if(p === ")"){
    var opens=0, closes=0;
    for(var i=0;i<tokens.length;i++){
      if(tokens[i]==="(") opens++;
      if(tokens[i]===")") closes++;
    }
    if(opens<=closes) return;
  }
  tokens.push(p);
  updateDisplay();
}

function pressFunc(name){
  startFreshIfNeeded(true);
  tokens.push(name, "(");
  updateDisplay();
}

function pressConst(c){
  startFreshIfNeeded(true);
  tokens.push(c);
  updateDisplay();
}

function pressAction(action){
  startFreshIfNeeded(action !== "negate" && action !== "square" && action !== "reciprocal" && action !== "factorial" && action !== "percent");
  switch(action){
    case "clear": tokens = []; justEvaluated = false; break;
    case "backspace": doBackspace(); break;
    case "dot": pressDot(); return;
    case "negate": doNegate(); break;
    case "square": if(tokens.length){ tokens.push("^","2"); } break;
    case "reciprocal": if(tokens.length){ tokens.push("^","(","-","1",")"); } break;
    case "factorial": if(tokens.length){ tokens.push("!"); } break;
    case "percent": if(tokens.length){ tokens.push("%"); } break;
    case "exp":
      if(tokens.length === 0) tokens.push("1");
      tokens.push("×","10","^");
      break;
    case "equals": doEquals(); return;
  }
  updateDisplay();
}

function doBackspace(){
  if(tokens.length === 0) return;
  var last = tokens[tokens.length-1];
  if(isNumberToken(last) && last.length > 1) tokens[tokens.length-1] = last.slice(0,-1);
  else tokens.pop();
  justEvaluated = false;
}

function doNegate(){
  if(tokens.length === 0) return;
  var n = tokens.length - 1;
  if(!isNumberToken(tokens[n])) return;
  var prev = tokens[n-1];
  var prevPrev = tokens[n-2];
  if(prev === "-" && (n-2 < 0 || ["+","-","×","÷","^","mod","("].indexOf(prevPrev) !== -1 || FUNC_NAMES.indexOf(prevPrev) !== -1)){
    tokens.splice(n-1,1);
  } else {
    tokens.splice(n,0,"-");
  }
}

function prepareTokensForEval(raw){
  var out = [];
  for(var i=0;i<raw.length;i++){
    var t = raw[i];
    if(out.length){
      var prevT = out[out.length-1];
      if(isTerminalLeft(prevT) && isPrimaryStart(t)) out.push("×");
    }
    out.push(t);
  }
  var opens=0, closes=0;
  for(var j=0;j<out.length;j++){
    if(out[j]==="(") opens++;
    if(out[j]===")") closes++;
  }
  while(closes < opens){ out.push(")"); closes++; }
  return out;
}

function Parser(toks){ this.toks = toks; this.pos = 0; }
Parser.prototype.peek = function(){ return this.toks[this.pos]; };
Parser.prototype.next = function(){ return this.toks[this.pos++]; };
Parser.prototype.expect = function(t){
  var got = this.next();
  if(got !== t) throw new CalcError("Invalid Expression");
};

Parser.prototype.parseExpression = function(){
  var node = this.parseTerm();
  while(this.peek() === "+" || this.peek() === "-"){
    var op = this.next(), right = this.parseTerm();
    node = {type:"bin", op:op, left:node, right:right};
  }
  return node;
};
Parser.prototype.parseTerm = function(){
  var node = this.parseUnary();
  while(this.peek() === "×" || this.peek() === "÷" || this.peek() === "mod"){
    var op = this.next(), right = this.parseUnary();
    node = {type:"bin", op:op, left:node, right:right};
  }
  return node;
};
Parser.prototype.parseUnary = function(){
  if(this.peek() === "-" || this.peek() === "+"){
    var op = this.next(), operand = this.parseUnary();
    return {type:"unary", op:op, operand:operand};
  }
  return this.parsePower();
};
Parser.prototype.parsePower = function(){
  var left = this.parsePostfix();
  if(this.peek() === "^"){
    this.next();
    var right = this.parseUnary();
    return {type:"bin", op:"^", left:left, right:right};
  }
  return left;
};
Parser.prototype.parsePostfix = function(){
  var node = this.parsePrimary();
  while(this.peek() === "!" || this.peek() === "%"){
    var op = this.next();
    node = {type:"postfix", op:op, operand:node};
  }
  return node;
};
Parser.prototype.parsePrimary = function(){
  var t = this.peek();
  if(t === undefined) throw new CalcError("Invalid Expression");
  if(t === "("){
    this.next();
    var node = this.parseExpression();
    this.expect(")");
    return node;
  }
  if(isNumberToken(t)){ this.next(); return {type:"num", value: parseFloat(t)}; }
  if(t === "π"){ this.next(); return {type:"num", value: Math.PI}; }
  if(t === "e"){ this.next(); return {type:"num", value: Math.E}; }
  if(FUNC_NAMES.indexOf(t) !== -1){
    var fname = this.next();
    this.expect("(");
    var arg = this.parseExpression();
    this.expect(")");
    return {type:"func", name:fname, arg:arg};
  }
  throw new CalcError("Invalid Expression");
};

function factorial(n){
  if(n < 0 || Math.abs(n - Math.round(n)) > 1e-9) throw new CalcError("Invalid factorial");
  n = Math.round(n);
  if(n > 170) return Infinity;
  var r = 1;
  for(var i=2;i<=n;i++) r *= i;
  return r;
}
function toRad(v){ return angleMode === "DEG" ? v * Math.PI / 180 : v; }
function fromRad(v){ return angleMode === "DEG" ? v * 180 / Math.PI : v; }

function evaluateNode(node){
  switch(node.type){
    case "num": return node.value;
    case "unary": {
      var v = evaluateNode(node.operand);
      return node.op === "-" ? -v : v;
    }
    case "postfix": {
      var pv = evaluateNode(node.operand);
      if(node.op === "!") return factorial(pv);
      if(node.op === "%") return pv / 100;
      return pv;
    }
    case "bin": {
      var l = evaluateNode(node.left), r = evaluateNode(node.right);
      switch(node.op){
        case "+": return l + r;
        case "-": return l - r;
        case "×": return l * r;
        case "÷": if(r === 0) throw new CalcError("Cannot divide by zero"); return l / r;
        case "mod": if(r === 0) throw new CalcError("Cannot divide by zero"); return l % r;
        case "^": return Math.pow(l, r);
      }
      break;
    }
    case "func": {
      var a = evaluateNode(node.arg);
      switch(node.name){
        case "sin": return Math.sin(toRad(a));
        case "cos": return Math.cos(toRad(a));
        case "tan": return Math.tan(toRad(a));
        case "asin": if(a < -1 || a > 1) throw new CalcError("Invalid input"); return fromRad(Math.asin(a));
        case "acos": if(a < -1 || a > 1) throw new CalcError("Invalid input"); return fromRad(Math.acos(a));
        case "atan": return fromRad(Math.atan(a));
        case "log": if(a <= 0) throw new CalcError("Invalid logarithm"); return Math.log10(a);
        case "ln": if(a <= 0) throw new CalcError("Invalid logarithm"); return Math.log(a);
        case "sqrt": if(a < 0) throw new CalcError("Invalid square root"); return Math.sqrt(a);
        case "abs": return Math.abs(a);
        case "floor": return Math.floor(a);
        case "ceil": return Math.ceil(a);
      }
      break;
    }
  }
  throw new CalcError("Invalid Expression");
}

function evaluateTokens(raw){
  if(!raw || raw.length === 0) throw new CalcError("Empty expression");
  var prepared = prepareTokensForEval(raw);
  var p = new Parser(prepared);
  var ast = p.parseExpression();
  if(p.pos !== prepared.length) throw new CalcError("Invalid Expression");
  var result = evaluateNode(ast);
  if(typeof result !== "number" || isNaN(result)) throw new CalcError("Invalid Expression");
  if(!isFinite(result)) throw new CalcError("Overflow");
  return result;
}

function cleanNumber(n){
  if(!isFinite(n)) return null;
  if(n === 0) return 0;
  var abs = Math.abs(n);
  if(abs > 1e15 || abs < 1e-9) return n;
  return parseFloat(n.toPrecision(12));
}
function numberToRawString(n){
  var abs = Math.abs(n);
  if(abs !== 0 && (abs > 1e15 || abs < 1e-9)){
    var s = n.toExponential(6);
    s = s.replace(/(\.\d*?)0+e/,"$1e").replace(/\.e/,"e");
    return s;
  }
  return String(cleanNumber(n));
}
function formatForDisplay(rawStr, applySeparator){
  if(rawStr.indexOf("e") !== -1) return rawStr;
  var neg = rawStr.charAt(0) === "-";
  var body = neg ? rawStr.slice(1) : rawStr;
  var parts = body.split(".");
  var intPart = parts[0], decPart = parts[1];
  if(applySeparator) intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (neg ? "-" : "") + intPart + (decPart !== undefined ? "." + decPart : "");
}

function renderExpression(){
  if(tokens.length === 0) return "";
  var out = "";
  for(var i=0;i<tokens.length;i++){
    var t = tokens[i], prev = tokens[i-1];
    if(t === "+" || t === "-" || t === "×" || t === "÷" || t === "^" || t === "mod"){
      var isUnary = (t === "-" || t === "+") && (prev === undefined || ["+","-","×","÷","^","mod","("].indexOf(prev) !== -1 || FUNC_NAMES.indexOf(prev) !== -1);
      if(isUnary) out += t; else out += " " + t + " ";
    } else if(t === "!" || t === "%") out += t;
    else if(t === "(" || t === ")") out += t;
    else if(FUNC_NAMES.indexOf(t) !== -1) out += FUNC_LABELS[t];
    else if(t === "π" || t === "e") out += t;
    else if(isNumberToken(t)) out += formatForDisplay(t, useThousands);
    else out += t;
  }
  return out.trim();
}

var exprEl = document.getElementById("exprDisplay");
var resultEl = document.getElementById("resultDisplay");
var memIndicatorEl = document.getElementById("memIndicator");
var mcBtn = document.getElementById("mcBtn");
var mrBtn = document.getElementById("mrBtn");

function updateDisplay(){
  var exprStr = renderExpression();
  exprEl.textContent = exprStr.length ? exprStr : "\u00A0";
  if(tokens.length === 0){
    resultEl.textContent = formatForDisplay(numberToRawString(lastResultValue === undefined ? 0 : 0), useThousands) === "" ? "0" : (justEvaluated ? numberToRawString(lastResultValue) : "0");
    if(!justEvaluated) resultEl.textContent = "0";
  } else {
    try{
      var val = evaluateTokens(tokens);
      resultEl.textContent = formatForDisplay(numberToRawString(val), useThousands);
    }catch(e){
      resultEl.textContent = justEvaluated ? formatForDisplay(numberToRawString(lastResultValue), useThousands) : "";
    }
  }
  updateMemoryIndicator();
}
function updateMemoryIndicator(){
  var has = memoryValue !== null && memoryValue !== undefined;
  memIndicatorEl.classList.toggle("show", has);
  mcBtn.disabled = !has;
  mrBtn.disabled = !has;
}

function doEquals(){
  if(tokens.length === 0){ updateDisplay(); return; }
  try{
    var exprStrBefore = renderExpression();
    var val = evaluateTokens(tokens);
    var clean = cleanNumber(val);
    lastResultValue = clean;
    var raw = numberToRawString(clean);
    resultEl.textContent = formatForDisplay(raw, useThousands);
    exprEl.textContent = exprStrBefore + " =";
    addHistoryEntry(exprStrBefore, formatForDisplay(raw, useThousands), clean);
    tokens = [raw.indexOf("e") !== -1 ? raw : String(clean)];
    justEvaluated = true;
  }catch(err){
    var msg = (err && err.message) ? err.message : "Error";
    resultEl.textContent = msg;
    showToast(msg);
    justEvaluated = false;
  }
}
function addHistoryEntry(exprStr, resultStr, rawValue){
  history.unshift({expr:exprStr,result:resultStr,raw:rawValue,time:new Date().toISOString()});
  if(history.length > 100) history = history.slice(0,100);
  saveHistory();
  renderHistoryList(document.getElementById("historySearch").value);
}

function currentValueForMemory(){
  try{
    if(tokens.length === 0) return justEvaluated ? lastResultValue : 0;
    return evaluateTokens(tokens);
  }catch(e){ return justEvaluated ? lastResultValue : 0; }
}
function handleMemory(action){
  switch(action){
    case "mc": memoryValue = null; saveMemory(); showToast("Memory cleared"); break;
    case "mr":
      if(memoryValue !== null){
        var s = numberToRawString(memoryValue);
        if(tokens.length === 0 || justEvaluated){ tokens = [s]; justEvaluated = false; }
        else tokens.push(s);
      }
      break;
    case "mp":
      memoryValue = (memoryValue || 0) + currentValueForMemory();
      saveMemory(); showToast("Memory updated"); break;
    case "mm":
      memoryValue = (memoryValue || 0) - currentValueForMemory();
      saveMemory(); showToast("Memory updated"); break;
  }
  updateDisplay();
}

function showToast(msg){
  var container = document.getElementById("toastContainer");
  var t = document.createElement("div");
  t.className = "toast"; t.textContent = msg; container.appendChild(t);
  setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); }, 2100);
}

function copyResult(){
  var text = resultEl.textContent;
  if(!text) return;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){ showToast("Copied!"); }).catch(function(){ fallbackCopy(text); });
  } else fallbackCopy(text);
}
function fallbackCopy(text){
  try{
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta); showToast("Copied!");
  }catch(e){ showToast("Copy not supported"); }
}

var historyPanel = document.getElementById("historyPanel");
var settingsPanel = document.getElementById("settingsPanel");
var overlay = document.getElementById("overlay");

function openPanel(panel){ overlay.classList.add("open"); panel.classList.add("open"); }
function closePanels(){
  overlay.classList.remove("open");
  historyPanel.classList.remove("open");
  settingsPanel.classList.remove("open");
}

function renderHistoryList(filter){
  var listEl = document.getElementById("histList");
  listEl.innerHTML = "";
  var filtered = history;
  if(filter && filter.trim().length){
    var f = filter.trim().toLowerCase();
    filtered = history.filter(function(h){
      return h.expr.toLowerCase().indexOf(f) !== -1 || h.result.toLowerCase().indexOf(f) !== -1;
    });
  }
  if(filtered.length === 0){
    var empty = document.createElement("div");
    empty.className = "empty-hint";
    empty.textContent = history.length === 0 ? "No calculations yet" : "No matches found";
    listEl.appendChild(empty);
    return;
  }
  filtered.forEach(function(h){
    var item = document.createElement("div"); item.className = "hist-item";
    var main = document.createElement("div"); main.className = "hist-main";
    var exprDiv = document.createElement("div"); exprDiv.className = "hist-expr"; exprDiv.textContent = h.expr;
    var resDiv = document.createElement("div"); resDiv.className = "hist-result"; resDiv.textContent = h.result;
    main.appendChild(exprDiv); main.appendChild(resDiv);
    main.addEventListener("click", function(){
      var s = numberToRawString(h.raw);
      if(tokens.length === 0 || justEvaluated){ tokens = [s]; justEvaluated = false; }
      else tokens.push(s);
      updateDisplay(); closePanels();
    });
    var copyB = document.createElement("button");
    copyB.className = "hist-copy"; copyB.setAttribute("aria-label","Copy this result"); copyB.textContent = "⧉";
    copyB.addEventListener("click", function(ev){
      ev.stopPropagation();
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(h.result).then(function(){ showToast("Copied!"); }).catch(function(){ fallbackCopy(h.result); });
      } else fallbackCopy(h.result);
    });
    item.appendChild(main); item.appendChild(copyB); listEl.appendChild(item);
  });
}

var appEl = document.getElementById("app");
function applyTheme(){
  appEl.setAttribute("data-theme", theme);
  document.getElementById("themeBtn").textContent = theme === "dark" ? "☀" : "🌙";
  document.getElementById("themeToggleSwitch").checked = theme === "dark";
}
function toggleTheme(){ theme = theme === "dark" ? "light" : "dark"; applyTheme(); saveSettings(); }
function applyAngleMode(){
  document.getElementById("degRadLabel").textContent = angleMode;
  var buttons = document.querySelectorAll("#settingsDegRad button");
  buttons.forEach(function(b){ b.classList.toggle("active", b.getAttribute("data-val") === angleMode); });
}
function toggleAngleMode(){
  angleMode = angleMode === "DEG" ? "RAD" : "DEG";
  applyAngleMode(); saveSettings(); updateDisplay();
}
function applyThousands(){ document.getElementById("thousandsToggle").checked = useThousands; }

var basicModeBtn = document.getElementById("basicModeBtn");
var sciModeBtn = document.getElementById("sciModeBtn");
var sciKeys = document.getElementById("sciKeys");
function setMode(mode){
  var isSci = mode === "sci";
  sciKeys.classList.toggle("show", isSci);
  basicModeBtn.classList.toggle("active", !isSci);
  sciModeBtn.classList.toggle("active", isSci);
  basicModeBtn.setAttribute("aria-selected", String(!isSci));
  sciModeBtn.setAttribute("aria-selected", String(isSci));
}

document.getElementById("mainKeys").addEventListener("click", handleKeyClick);
document.getElementById("sciKeys").addEventListener("click", handleKeyClick);
function handleKeyClick(e){
  var btn = e.target.closest(".btn");
  if(!btn) return;
  if(btn.dataset.digit !== undefined){ pressDigit(btn.dataset.digit); return; }
  if(btn.dataset.op !== undefined){ pressOperator(btn.dataset.op); return; }
  if(btn.dataset.paren !== undefined){ pressParen(btn.dataset.paren); return; }
  if(btn.dataset.func !== undefined){ pressFunc(btn.dataset.func); return; }
  if(btn.dataset.const !== undefined){ pressConst(btn.dataset.const); return; }
  if(btn.dataset.action !== undefined){ pressAction(btn.dataset.action); return; }
}
document.querySelectorAll(".mem-btn[data-mem]").forEach(function(b){
  b.addEventListener("click", function(){ handleMemory(b.dataset.mem); });
});
document.getElementById("copyBtn").addEventListener("click", copyResult);
basicModeBtn.addEventListener("click", function(){ setMode("basic"); });
sciModeBtn.addEventListener("click", function(){ setMode("sci"); });
document.getElementById("degRadBtn").addEventListener("click", toggleAngleMode);
document.getElementById("themeBtn").addEventListener("click", toggleTheme);
document.getElementById("historyBtn").addEventListener("click", function(){
  renderHistoryList(document.getElementById("historySearch").value);
  openPanel(historyPanel);
});
document.getElementById("settingsBtn").addEventListener("click", function(){ openPanel(settingsPanel); });
document.getElementById("closeHistory").addEventListener("click", closePanels);
document.getElementById("closeSettings").addEventListener("click", closePanels);
overlay.addEventListener("click", closePanels);
document.getElementById("historySearch").addEventListener("input", function(){ renderHistoryList(this.value); });
document.getElementById("clearHistoryBtn").addEventListener("click", clearAllHistory);
document.getElementById("settingsClearHistory").addEventListener("click", clearAllHistory);
function clearAllHistory(){
  history = []; saveHistory(); renderHistoryList(""); showToast("History cleared");
}
document.getElementById("themeToggleSwitch").addEventListener("change", toggleTheme);
document.getElementById("thousandsToggle").addEventListener("change", function(){
  useThousands = this.checked; saveSettings(); updateDisplay();
});
document.querySelectorAll("#settingsDegRad button").forEach(function(b){
  b.addEventListener("click", function(){
    var val = b.getAttribute("data-val");
    if(val !== angleMode){ angleMode = val; applyAngleMode(); saveSettings(); updateDisplay(); }
  });
});

window.addEventListener("keydown", function(e){
  var k = e.key;
  if(k >= "0" && k <= "9"){ pressDigit(k); e.preventDefault(); return; }
  switch(k){
    case ".": pressDot(); e.preventDefault(); return;
    case "+": pressOperator("+"); e.preventDefault(); return;
    case "-": pressOperator("-"); e.preventDefault(); return;
    case "*": pressOperator("×"); e.preventDefault(); return;
    case "/": pressOperator("÷"); e.preventDefault(); return;
    case "%": pressAction("percent"); e.preventDefault(); return;
    case "(": pressParen("("); e.preventDefault(); return;
    case ")": pressParen(")"); e.preventDefault(); return;
    case "^": pressOperator("^"); e.preventDefault(); return;
    case "Enter": case "=": pressAction("equals"); e.preventDefault(); return;
    case "Backspace": pressAction("backspace"); e.preventDefault(); return;
    case "Escape": pressAction("clear"); e.preventDefault(); return;
  }
});

function init(){
  loadState(); applyTheme(); applyAngleMode(); applyThousands();
  renderHistoryList(""); updateDisplay();
  if(!storageOK) showToast("Local storage unavailable - progress won't be saved");
}
init();

})();