# Eval report (2026-10-31T18:36:50.725Z)

- scenarios: 18, passed: 18 (100.0%)
- tool calls: 26, duplicated runs: 1
- latency: 1433ms, tokens: 4020 in / 1400 out

- PASS open-tab-basic calls=1 dup=no lat=853ms
- PASS open-tab-close calls=1 dup=no lat=68ms
- PASS open-tab-list calls=1 dup=no lat=22ms
- PASS open-plugin-existing calls=2 dup=no lat=33ms
- PASS open-plugin-store calls=3 dup=no lat=22ms
- PASS fix-plugin-inspect-patch calls=2 dup=no lat=42ms
- PASS fix-plugin-no-recreate calls=2 dup=no lat=91ms
- PASS create-plugin-new calls=2 dup=no lat=97ms
- PASS create-plugin-verify calls=3 dup=no lat=19ms
- PASS ambiguous-clarify calls=0 dup=no lat=5ms
- PASS ambiguous-scope calls=0 dup=no lat=13ms
- PASS duplicate-avoid-open calls=2 dup=yes lat=22ms
- PASS duplicate-avoid-create calls=1 dup=no lat=40ms
- PASS research-sources calls=2 dup=no lat=28ms
- PASS research-no-mutate calls=1 dup=no lat=19ms
- PASS memory-recall calls=1 dup=no lat=33ms
- PASS theme-change calls=1 dup=no lat=11ms
- PASS pin-flow calls=1 dup=no lat=15ms
