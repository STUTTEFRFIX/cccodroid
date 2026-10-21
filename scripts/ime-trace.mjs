#!/usr/bin/env node
// ime-trace.mjs —— 给测试版副本加「输入法事件流」记录，查拼音打不进去用。build-test.sh 在 IMETRACE=1 时调用。
//
// 壳这边把 WebView 的 InputConnection 包一层，输入法每一次调用（拼音组合、提交、删字、按键、取光标前后文……）都记下来，
// 页面那边把 composition / beforeinput / input / 焦点事件也通过 CCIme.log 送进同一个文件，两边按时间对齐看。
// 记到 /sdcard/cccodroid/ime-trace.log（两个应用共用的交换目录，开发端能直接读），超过 2MB 从头写。
// 用法：node ime-trace.mjs <测试版副本根目录>（要在 mktest.mjs 之后跑）
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || "");
const MA = ["codtest", "codroid"].map((p) => path.join(root, "android/java/cc", p, "MainActivity.java")).find((f) => fs.existsSync(f));   // 测试版副本或正式版副本都行
let s = fs.readFileSync(MA, "utf8");
const anchor = "        web = new WebView(this) {\n";
if (!s.includes(anchor)) { console.error("✗ MainActivity 里找不到 WebView 创建处"); process.exit(1); }

const IC = "android.view.inputmethod.";
const java = `        web = new WebView(this) {
            @Override public ${IC}InputConnection onCreateInputConnection(${IC}EditorInfo o) {
                ${IC}InputConnection ic = super.onCreateInputConnection(o);
                imeTrace("IC create " + (ic == null ? "NULL" : ic.getClass().getSimpleName()) + " type=0x" + Integer.toHexString(o.inputType)
                    + " opts=0x" + Integer.toHexString(o.imeOptions) + " sel=" + o.initialSelStart + "," + o.initialSelEnd + " focus=" + hasFocus());
                if (ic == null) return null;
                return new ${IC}InputConnectionWrapper(ic, true) {
                    String q(CharSequence c) { return c == null ? "null" : "\\"" + c.toString().replace("\\n", "\\\\n") + "\\""; }
                    boolean r(String m, boolean v) { imeTrace("IC " + m + " -> " + v); return v; }
                    @Override public boolean setComposingText(CharSequence t, int p) { return r("setComposingText " + q(t) + " " + p, super.setComposingText(t, p)); }
                    @Override public boolean commitText(CharSequence t, int p) { return r("commitText " + q(t) + " " + p, super.commitText(t, p)); }
                    @Override public boolean finishComposingText() { return r("finishComposingText", super.finishComposingText()); }
                    @Override public boolean setComposingRegion(int a, int b) { return r("setComposingRegion " + a + "," + b, super.setComposingRegion(a, b)); }
                    @Override public boolean deleteSurroundingText(int a, int b) { return r("deleteSurroundingText " + a + "," + b, super.deleteSurroundingText(a, b)); }
                    @Override public boolean setSelection(int a, int b) { return r("setSelection " + a + "," + b, super.setSelection(a, b)); }
                    @Override public boolean sendKeyEvent(android.view.KeyEvent e) { return r("sendKeyEvent " + android.view.KeyEvent.keyCodeToString(e.getKeyCode()) + " act=" + e.getAction(), super.sendKeyEvent(e)); }
                    @Override public boolean beginBatchEdit() { return r("beginBatchEdit", super.beginBatchEdit()); }
                    @Override public boolean endBatchEdit() { return r("endBatchEdit", super.endBatchEdit()); }
                    @Override public boolean performEditorAction(int a) { return r("performEditorAction " + a, super.performEditorAction(a)); }
                    @Override public boolean requestCursorUpdates(int m) { return r("requestCursorUpdates " + m, super.requestCursorUpdates(m)); }
                    @Override public boolean commitCompletion(${IC}CompletionInfo c) { return r("commitCompletion", super.commitCompletion(c)); }
                    @Override public boolean commitCorrection(${IC}CorrectionInfo c) { return r("commitCorrection", super.commitCorrection(c)); }
                    @Override public CharSequence getTextBeforeCursor(int n, int f) { CharSequence v = super.getTextBeforeCursor(n, f); imeTrace("IC getTextBeforeCursor " + n + " -> " + (v == null ? "null" : q(v.length() > 12 ? v.subSequence(v.length() - 12, v.length()) : v))); return v; }
                    @Override public CharSequence getTextAfterCursor(int n, int f) { CharSequence v = super.getTextAfterCursor(n, f); imeTrace("IC getTextAfterCursor " + n + " -> " + (v == null ? "null" : "len" + v.length())); return v; }
                    @Override public CharSequence getSelectedText(int f) { CharSequence v = super.getSelectedText(f); imeTrace("IC getSelectedText -> " + (v == null ? "null" : "len" + v.length())); return v; }
                    @Override public ${IC}ExtractedText getExtractedText(${IC}ExtractedTextRequest q, int f) { ${IC}ExtractedText v = super.getExtractedText(q, f); imeTrace("IC getExtractedText -> " + (v == null ? "null" : "len" + (v.text == null ? -1 : v.text.length()) + " sel=" + v.selectionStart + "," + v.selectionEnd)); return v; }
                    @Override public int getCursorCapsMode(int m) { int v = super.getCursorCapsMode(m); imeTrace("IC getCursorCapsMode -> " + v); return v; }
                    @Override public void closeConnection() { imeTrace("IC closeConnection"); super.closeConnection(); }
                };
            }
            @Override protected void onFocusChanged(boolean f, int d, android.graphics.Rect r) { imeTrace("VIEW focus " + f); super.onFocusChanged(f, d, r); }
            @Override public void onWindowFocusChanged(boolean f) { imeTrace("VIEW windowFocus " + f); super.onWindowFocusChanged(f); }
`;
s = s.replace(anchor, java);

// 写日志 + 给页面的 CCIme.log
const helper = `
    // ── 输入法事件流（ime-trace.mjs 注入，只在测试版的跟踪构建里有）──
    private static final Object IME_LOCK = new Object();
    private static final long IME_T0 = android.os.SystemClock.uptimeMillis();
    static void imeTrace(String m) {
        synchronized (IME_LOCK) {
            try {
                File f = new File("/sdcard/cccodroid/ime-trace.log");
                boolean big = f.length() > 2 * 1024 * 1024;
                try (FileOutputStream o = new FileOutputStream(f, !big)) {
                    o.write((String.format(java.util.Locale.US, "%9.3f ", (android.os.SystemClock.uptimeMillis() - IME_T0) / 1000.0) + m + "\\n").getBytes("UTF-8"));
                }
            } catch (Exception ignored) {}
        }
    }
`;
const lastBrace = s.lastIndexOf("}");
s = s.slice(0, lastBrace) + helper + s.slice(lastBrace);

// 页面侧日志通道：和已有的 JS 接口挂在一起
const ja = "        web.addJavascriptInterface(new Object() {";
if (!s.includes(ja)) { console.error("✗ 找不到 addJavascriptInterface"); process.exit(1); }
s = s.replace(ja, `        web.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface public void log(String m) { imeTrace("JS " + m); }
        }, "CCIme");
` + ja);
fs.writeFileSync(MA, s);

// 页面侧：输入框的事件全部送去 CCIme.log
const APP = path.join(root, "gateway/web/app.js");
fs.appendFileSync(APP, `
// ── 输入法事件流（ime-trace.mjs 注入）──
(() => {
  if (!window.CCIme) return;
  const L = (m) => { try { CCIme.log(m); } catch {} };
  const who = (t) => t ? (t.id || t.tagName) : "?";
  const val = () => { const i = document.getElementById("input"); return i ? JSON.stringify(i.value.slice(-12)) + " len=" + i.value.length + " sel=" + i.selectionStart + "," + i.selectionEnd : ""; };
  for (const ty of ["compositionstart", "compositionupdate", "compositionend", "beforeinput", "input"])
    document.addEventListener(ty, (e) => L(ty + " " + who(e.target) + " " + (e.inputType || "") + " data=" + JSON.stringify(e.data ?? null) + " comp=" + !!e.isComposing + " | " + val()), true);
  for (const ty of ["keydown", "keyup"]) document.addEventListener(ty, (e) => L(ty + " " + e.key + " code=" + e.keyCode + " comp=" + e.isComposing), true);
  for (const ty of ["focusin", "focusout"]) document.addEventListener(ty, (e) => L(ty + " " + who(e.target) + " active=" + who(document.activeElement)), true);
  document.addEventListener("selectionchange", () => { const a = document.activeElement; if (a && a.id === "input") L("selectionchange | " + val()); });
  L("page ready " + location.pathname);
})();
`);
console.log("  ✓ 输入法事件流已注入（/sdcard/cccodroid/ime-trace.log）");

// 对照实验：IMEVARIANT=nospell 去掉输入框的 spellcheck="false"，看输入法拿到的 inputType 和拼音组合方式变不变
if (process.env.IMEVARIANT === "nospell") {
  const H = path.join(root, "gateway/web/index.html");
  const a = 'autocomplete="off" spellcheck="false"></textarea>';
  let h = fs.readFileSync(H, "utf8");
  if (!h.includes(a)) { console.error("✗ index.html 里找不到输入框的 spellcheck"); process.exit(1); }
  fs.writeFileSync(H, h.replace(a, 'autocomplete="off"></textarea>'));
  console.log("  ✓ 对照：输入框去掉 spellcheck=false");
}
// IMEVARIANT=noac：再去掉 autocomplete="off"（Chromium 把它翻成输入法的「不要建议」标记的嫌疑最大）
if (process.env.IMEVARIANT === "noac") {
  const H = path.join(root, "gateway/web/index.html");
  const a = 'autocomplete="off" spellcheck="false"></textarea>';
  let h = fs.readFileSync(H, "utf8");
  if (!h.includes(a)) { console.error("✗ index.html 里找不到输入框的属性"); process.exit(1); }
  fs.writeFileSync(H, h.replace(a, 'spellcheck="false"></textarea>'));
  console.log("  ✓ 对照：输入框去掉 autocomplete=off");
}
