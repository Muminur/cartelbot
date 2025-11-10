// Inline test execution to verify parser
// This simulates what would happen when parsing each signal

import { parseSignal } from "../lib/parser/text-parser";

console.log("Testing Signal 1: $MLN - Percentage targets");
const mln = parseSignal(`Buying $Mln
First buying: 6.28 – 6.31
Second buying: 5.94
CMP: 6.28
Targets:
4%
8%
12%
20%
30%
Sl: 5.69`);
console.log(JSON.stringify(mln, null, 2));
console.log("\n");

console.log("Testing Signal 2: $RAD - Price targets with CMP");
const rad = parseSignal(`Buying $Rad
First buying: 0.677 – 0.68
Second buying: 0.637
CMP: 0.678
Targets:
0.704
0.730
0.760
0.814
0.880
Sl: 0.605`);
console.log(JSON.stringify(rad, null, 2));
console.log("\n");

console.log("Testing Signal 3: $POND - Scientific notation");
const pond = parseSignal(`Buying $Pond
First buying: 0.00824 – 0.00829
Second buying: 0.00780
CMP: 0.00825
Targets
0.00857
0.00893
0.00925
0.00990
0.01075
Sl: 0.00740`);
console.log(JSON.stringify(pond, null, 2));
console.log("\n");

console.log("Testing Signal 4: $NEAR - Entry range");
const near = parseSignal(`$NEAR Buying Now:
Entry: 2.270 - 2.124
Targets:
2.370
2.510
2.690
2.820
SL: 2.050`);
console.log(JSON.stringify(near, null, 2));
console.log("\n");

console.log("Testing Signal 5: $ROSE - Entry range");
const rose = parseSignal(`$ROSE Buying Now
Entry: 0.01670 - 0.01590
Targets:
0.01725
0.01794
0.01832
0.01902
SL: 0.01509`);
console.log(JSON.stringify(rose, null, 2));
