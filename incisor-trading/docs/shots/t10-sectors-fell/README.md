Desktop only, on purpose.

This set exists to hold one picture: a window where all but one sector fell,
which draws the mirror of the default view — the zero line near the right, bars
growing left from it. That is a fact about the axis, and it is the same fact at
every width, so it is held once at the width it reads largest.

The reason used to be that the axis was only on screen above 560px, because the
narrow rule deleted the bar. It does not any more — the T10 audit stacked the
bar under the name instead — so the mobile shot in `t10-sectors/` shows the
stacked layout and this one shows the mirrored axis, and neither needs to show
both.

    ./.devtools/bin/python tools/shoot.py --out docs/shots/t10-sectors-fell \
        --api http://127.0.0.1:8789 --sector-window 1M
