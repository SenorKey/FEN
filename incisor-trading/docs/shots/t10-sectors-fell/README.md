Desktop only, on purpose.

This set exists to hold one picture: a window where all but one sector fell,
which draws the mirror of the default view — the zero line near the right, bars
growing left from it. That is a fact about the axis, and the axis is only on
screen above 560px. The tablet shot showed the same eleven rows at a narrower
width, and the mobile shot has no bar at all, so both said what
`t10-sectors/` already says.

    ./.devtools/bin/python tools/shoot.py --out docs/shots/t10-sectors-fell \
        --api http://127.0.0.1:8789 --sector-window 1M
