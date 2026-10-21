#!/bin/sh
# ─────────────────────────────────────────────────────────────────────
#  build-test.sh —— 构建测试版 cccodroid-test（包名 cc.codtest），可以和正式版同时装
#
#  做法：把源码拷到私有目录，mktest.mjs 改包名 / 端口 / 应用名 / 更新渠道、打开网页调试，再用那份副本跑 build.sh。
#  主线代码一行不用为测试版改；mktest 的精确替换对不上会直接报错，提醒同步。
#  钥匙：TEST_KEY（默认构建机私有目录的 cccodroid-test.json），和正式版不是同一把，所以两个应用互不覆盖。
#  工具包：TESTKIT（默认 testkit-2026.10.21）—— devkit.yml 手动运行、target=cc.codtest 打出来的预发布。
#  产物：dist/cccodroid-test.apk。发布：sh scripts/release-test.sh
# ─────────────────────────────────────────────────────────────────────
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
F=/data/user/0/li.dsh.claudecli/files
TEST_KEY=${TEST_KEY:-$F/bldtools/cccodroid-test.json}
TESTKIT=${TESTKIT:-testkit-2026.10.21}
W=${WORK:-$F/home/.work/cccodroid-test}
[ -f "$TEST_KEY" ] || { echo "✗ 找不到测试版钥匙 $TEST_KEY"; exit 1; }

echo "▸ 源码副本 → $W"
rm -rf "$W"; mkdir -p "$W"
cp -RL "$ROOT/android" "$ROOT/gateway" "$ROOT/scripts" "$W/"
cp "$ROOT/devkit-sources.txt" "$ROOT/devkit-pin.json" "$W/"
rm -rf "$W/android/build" "$W/android/assets/app"
node "$ROOT/scripts/mktest.mjs" "$W"

DEVKIT_BASES="https://github.com/greyoak111/cccodroid/releases/download/$TESTKIT/" KEY="$TEST_KEY" sh "$W/scripts/build.sh"
mkdir -p "$ROOT/dist"
cp "$W/dist/cccodroid.apk" "$ROOT/dist/cccodroid-test.apk"
echo "✓ $ROOT/dist/cccodroid-test.apk"
