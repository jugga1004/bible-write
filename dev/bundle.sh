#!/bin/sh
# <script src="...">와 <link rel="stylesheet" href="...">를 파일 내용으로 바꿔
# 단일 HTML을 만든다. 확인용이며 배포 산출물이 아니다.
# (heart-translator/dev/bundle.sh 와 같은 역할)
#
#   사용법: sh dev/bundle.sh index.html > dev/_bundle.html
src="$1"
dir=$(dirname "$src")
awk -v dir="$dir" '
  /<script src="[^"]*"><\/script>/ {
    line = $0
    sub(/.*<script src="/, "", line)
    sub(/"><\/script>.*/, "", line)
    print "<script>"
    while ((getline l < (dir "/" line)) > 0) print l
    close(dir "/" line)
    print "</script>"
    next
  }
  /<link rel="stylesheet" href="[^"]*">/ {
    line = $0
    sub(/.*<link rel="stylesheet" href="/, "", line)
    sub(/">.*/, "", line)
    print "<style>"
    while ((getline l < (dir "/" line)) > 0) print l
    close(dir "/" line)
    print "</style>"
    next
  }
  { print }
' "$src"
