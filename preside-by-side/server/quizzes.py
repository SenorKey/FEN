"""The Case Chronicle quizzes, as the suggest service knows them.

Read by suggest.py, which refuses any question or reader type not listed
here, and by quiz_stats.py, which reports in this order and lists every
type, including ones nobody has been given yet.

Every value a quiz page sends is one of a closed set, so the counts can
only ever be counts of questions and reader types the page really offers.
A question id is the data-q on its <section>, in page order. A type is the
data-type in the list at the end of the page, in the order of the line
drawn under the result (Doe's side first), then the two that sit in the
middle without a lean. Changing either on the page means changing it here
too, or the service refuses it.

Adding a quiz: a row here, keyed by the data-quiz on its .qz.

result_seed: ARTIFICIAL. That many made-up results per reader type are
added to the counts the service sends back to the page, never written to
the database. It lets "Readers who landed here" show a share from the
first reader on (1 real result among 7 seeds reads 25%, not 100%) instead
of waiting for QUIZ_MIN_DISPLAY finished quizzes. The database and
quiz_stats.py hold only real results. Set it to 0 to remove it once there
is real traffic; nothing else needs changing.
"""

QUIZZES = {
    'doe-v-bonnell': {
        'questions': (
            'recorded', 'permission', 'revenge', 'posted', 'real-rose',
            'minor', 'april-2022', 'sworn-later', 'log', 'credible',
        ),
        'types': (
            'burnt-bridge', 'doe-fan', 'knower', 'destiny-fan', 'dgger',
            'fence-sitter', 'made-for-you',
        ),
        # ARTIFICIAL: one made-up result per type, added 2026-11-27. See
        # result_seed above; 0 removes it.
        'result_seed': 1,
    },
}

QUIZ_CHOICES = ('yes', 'unsure', 'no')
