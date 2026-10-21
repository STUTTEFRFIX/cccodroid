#!/usr/bin/env node
// mktest.mjs —— 把一份源码副本改成测试版 cccodroid-test（包名 cc.codtest），给 build-test.sh 用。
//
// 测试版要和正式版装在同一台机器上、互不干扰，所以凡是两个应用会抢的东西都换掉：
//   · 包名 / 私有目录 / 应用间套接字 / provider / 广播 action：cc.codroid → cc.codtest（10 个字符，工具包按它等长改前缀）
//   · 网关端口 8791 → 8792，本地模型端口 8811 → 8812
//   · 应用名 cccodroid → cccodroid-test
//   · 网页调试（CDP）默认开：正式版里的 Claude 可以连进测试版的页面点按钮、看 DOM。开着时连上 adb 的电脑也能读页面（含网关令牌），所以只给测试版
//   · 更新检查只认 test-v* 预发布里的 cccodroid-test.apk、testkit-* 工具包；正式版的 v* / devkit-* 一概不碰
// 交换文件用的 /sdcard/cccodroid 两个应用共用，方便互相递文件。
//
// 用法：node mktest.mjs <副本根目录>
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || "");
if (!fs.existsSync(path.join(root, "android/AndroidManifest.xml"))) { console.error("✗ 不是 cccodroid 源码副本：" + root); process.exit(1); }

let n = 0;
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!["build", ".git", "node_modules"].includes(e.name)) walk(p); continue; }
    const b = fs.readFileSync(p);
    if (b.includes(0)) continue;                         // 二进制（图标、字体、wasm）不碰
    const s = b.toString("utf8");
    if (!s.includes("cc.codroid")) continue;
    fs.writeFileSync(p, s.split("cc.codroid").join("cc.codtest"));
    n++;
  }
}
walk(path.join(root, "android"));
walk(path.join(root, "gateway"));
fs.renameSync(path.join(root, "android/java/cc/codroid"), path.join(root, "android/java/cc/codtest"));
console.log(`  包名改写：${n} 个文件`);

// 精确替换：没找到就报错，免得主线改了写法后测试版悄悄漏改
function patch(rel, pairs) {
  const f = path.join(root, rel);
  let s = fs.readFileSync(f, "utf8");
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.error(`✗ ${rel} 里找不到：${a}`); process.exit(1); }
    s = s.split(a).join(b);
  }
  fs.writeFileSync(f, s);
}
const J = "android/java/cc/codtest/";
patch("android/AndroidManifest.xml", [['android:label="cccodroid"', 'android:label="cccodroid-test"']]);
patch(J + "Env.java", [["static final int PORT = 8791;", "static final int PORT = 8792;"]]);
// 网关 0.3.8 起拆成 gateway/gw/ 下的模块
patch("gateway/gw/providers.mjs", [["Number(process.env.CCAPP_LLAMA_PORT) || 8811", "Number(process.env.CCAPP_LLAMA_PORT) || 8812"]]);
patch("gateway/gw/caps.mjs", [['product: PREFIX ? "cccodroid" : "Claude CLI"', 'product: PREFIX ? "cccodroid-test" : "Claude CLI"']]);
patch(J + "MainActivity.java", [['WebView.setWebContentsDebuggingEnabled(new File(env.home, ".webdebug").exists());', "WebView.setWebContentsDebuggingEnabled(true);   // 测试版：网页调试默认开"],
                                ['title.setText("cccodroid");', 'title.setText("cccodroid-test");']]);
patch(J + "GatewayService.java", [['.setContentTitle("cccodroid")', '.setContentTitle("cccodroid-test")']]);
patch(J + "Updater.java", [
  ['!tag.matches("v\\\\d+(\\\\.\\\\d+)*")', '!tag.matches("test-v\\\\d+(\\\\.\\\\d+)*")'],
  ["app.latest = tag.substring(1);", "app.latest = tag.substring(6);"],
  ['a.optString("name").equals("cccodroid.apk")', 'a.optString("name").equals("cccodroid-test.apk")'],
  ['app.alt = app.url.startsWith(MIRROR + "/") ? null : MIRROR + "/dl/" + tag + "/cccodroid.apk";', "app.alt = null;   // 测试版不进 cccodroid.net 镜像"],
  ['!tag.startsWith("devkit-")', '!tag.startsWith("testkit-")'],
  ["cmpVer(tag.substring(7), best.substring(7))", "cmpVer(tag.substring(8), best.substring(8))"],
]);
console.log("  ✓ 测试版改写完成");
