/* ==========================================================================
   Preside by Side — Interactions
   - Presidents keyed by id; each owns its own bars.
   - `selection` decides which president appears on each side.
   - JS renders bars, name badges, AND the picker dropdowns from these.
   - Desktop: bar click toggles inline expansion (same-side bars push down).
   - Mobile:  bar click opens a native <dialog> modal.
   ========================================================================== */

(function () {
    'use strict';

    /* --------------------------------------------------------------------------
       Presidents — single source of truth.

       Each entry is keyed by a stable `id`. The `selection` map below
       references those ids to decide who appears on which side. The
       picker dropdowns are also driven from this object.

       Adding a new president = adding an entry here. Nothing else needs
       to change for the picker to find them.

       President fields:
         id:          String — stable identifier; matches the object key
         firstName:   String — shown above the last name in the badge
         lastName:    String — shown big in the badge
         displayName: String (optional) — shown in the picker dropdown.
                      Falls back to lastName. Use this to disambiguate
                      common surnames (e.g. "G.W. Bush" vs "G.H.W. Bush").
         ordinal:     Number | Number[] — used by formatOrdinal() to render
                      "46th President" / "45th & 47th President".
                      Single number for one-term presidents, array for
                      non-consecutive multi-term cases.
         party:       String — drives future color theming (not wired up
                      yet; sides currently theme by .side-left / .side-right
                      in CSS).
         bars:        Array<Bar> — see Bar schema below. Empty array is fine.

       Bar schema:
         severity:    Number (1–10)
         title:       String — full title (desktop outer label + detail panel)
         shortLabel:  String — 2–3 words max, shown inside the bar on mobile
         description: String — long-form text in the expanded panel / modal
         sources:     Array<{ url: String, text: String }>
       -------------------------------------------------------------------------- */
    const presidents = {
        trump: {
            id: 'trump',
            firstName: 'Donald J.',
            lastName: 'Trump',
            ordinal: [45, 47],
            party: 'republican',
            bars: [
                {
                    severity: 10,
                    title: 'Attempted to Overturn the 2020 Election',
                    shortLabel: 'Election Overturn',
                    description: 'Following his 2020 defeat, Trump pushed false election-fraud claims, pressured state officials to alter results, coordinated alternate-elector schemes in multiple states, and pressured Vice President Pence to refuse certification of the Electoral College vote. The House January 6th Committee concluded Trump was the central cause of the effort to subvert the transfer of power. The DOJ later indicted him on four federal counts related to the scheme.',
                    sources: [
                        { url: 'https://www.govinfo.gov/content/pkg/GPO-J6-REPORT/pdf/GPO-J6-REPORT.pdf', text: 'House Select Committee Final Report — U.S. Government Publishing Office (2022)' },
                        { url: 'https://www.justice.gov/storage/US_v_Trump_23_cr_257.pdf', text: 'United States v. Trump — Federal Indictment, DOJ (Aug. 2023)' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Conduct on January 6th',
                    shortLabel: 'Jan. 6 Capitol',
                    description: 'On January 6, 2021, Trump summoned supporters to Washington D.C., addressed them with continued false election claims, and directed them to march to the Capitol. After the building was breached, he waited roughly three hours before issuing a public statement asking the crowd to leave, during which time legislators were sheltering from rioters. The House Jan. 6 Committee found he was aware of the violence and took no meaningful action to stop it.',
                    sources: [
                        { url: 'https://www.govinfo.gov/content/pkg/GPO-J6-REPORT/pdf/GPO-J6-REPORT.pdf', text: 'House Select Committee Final Report — U.S. Government Publishing Office (2022)' },
                        { url: 'https://www.congress.gov/117/bills/hres851/BILLS-117hres851eh.pdf', text: 'House Resolution Impeaching Trump for Incitement of Insurrection (Jan. 2021)' }
                    ]
                },
                {
                    severity: 8,
                    title: 'Family Separation at the Border',
                    shortLabel: 'Family Separation',
                    description: 'The Trump administration\'s "zero tolerance" policy, implemented in 2018, resulted in more than 3,000 children being separated from their parents at the southern border. A DOJ Office of Inspector General report found that the administration had failed to plan for the separations and did not establish an adequate system to track or reunite families. Many separations occurred even when parents had no criminal history beyond the civil immigration crossing.',
                    sources: [
                        { url: 'https://oig.justice.gov/reports/2020/e21012.pdf', text: 'DOJ Office of Inspector General Report on Family Separation (Jan. 2021)' },
                        { url: 'https://www.aclu.org/report/family-separation-aclu-report', text: 'ACLU Report: Family Separation by the Numbers' }
                    ]
                },
                {
                    severity: 8,
                    title: 'Withheld Ukraine Aid to Pressure Political Investigations',
                    shortLabel: 'Ukraine Aid Freeze',
                    description: 'In 2019, Trump withheld congressionally approved military aid to Ukraine while his administration pressed Ukrainian officials to publicly announce investigations into Joe Biden and his son Hunter. The Government Accountability Office concluded that the Office of Management and Budget violated the Impoundment Control Act by withholding the funds. Trump was impeached by the House over the matter; the Senate acquitted him largely along party lines.',
                    sources: [
                        { url: 'https://www.gao.gov/assets/gao-20-254.pdf', text: 'GAO Decision: OMB Violated Impoundment Control Act (Jan. 2020)' },
                        { url: 'https://www.congress.gov/116/bills/hres755/BILLS-116hres755enr.pdf', text: 'House Articles of Impeachment — 116th Congress (Dec. 2019)' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Mishandled Classified Documents and Obstructed Retrieval',
                    shortLabel: 'Classified Docs',
                    description: 'After leaving office, Trump retained hundreds of classified and national-defense documents at his Mar-a-Lago residence. Federal prosecutors alleged in a 37-count indictment that he refused to return the materials when requested, directed aides to move boxes to conceal them from investigators, and showed documents to unauthorized individuals. The case was ultimately dismissed on procedural grounds related to the special counsel\'s appointment, but the underlying evidence and indictment remain a matter of public record.',
                    sources: [
                        { url: 'https://www.justice.gov/storage/US_v_Trump_23_cr_80101.pdf', text: 'United States v. Trump — Classified Documents Indictment, DOJ (Jun. 2023)' },
                        { url: 'https://www.archives.gov/files/foia/pdfs/2022-nara-trump-referral.pdf', text: 'National Archives Referral to DOJ Regarding Presidential Records (Feb. 2022)' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Convicted of 34 Felony Counts of Falsifying Business Records',
                    shortLabel: 'Felony Conviction',
                    description: 'In May 2024, Trump was convicted by a Manhattan jury on all 34 felony counts of falsifying business records in the first degree. The charges stemmed from payments made to adult film actress Stormy Daniels before the 2016 election, recorded as legal expenses to conceal their true nature. He was sentenced in January 2025 to an unconditional discharge — no prison, probation, or fine — but the criminal conviction stands while he pursues appeals.',
                    sources: [
                        { url: 'https://www.nycourts.gov/courts/1jd/supctmanh/index.shtml', text: 'New York Supreme Court — People v. Trump, Case No. 71543-23' },
                        { url: 'https://apnews.com/article/trump-hush-money-trial-verdict-conviction-2024', text: 'Associated Press — Trump Convicted on All 34 Counts (May 2024)' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Found Liable for Sexual Abuse and Defamation',
                    shortLabel: 'E. Jean Carroll',
                    description: 'In May 2023, a federal civil jury found Trump liable for sexually abusing writer E. Jean Carroll and for defaming her after she went public with her account, awarding her $5 million. In a separate January 2024 defamation trial, a second jury awarded Carroll $83.3 million after Trump continued to deny the abuse publicly. Trump has appealed both verdicts. The jury findings constitute formal civil court determinations of liability.',
                    sources: [
                        { url: 'https://www.courtlistener.com/docket/6452284/carroll-v-trump/', text: 'Carroll v. Trump — Federal Court Docket, S.D.N.Y.' },
                        { url: 'https://apnews.com/article/trump-carroll-defamation-verdict-83-million-2024', text: 'Associated Press — Jury Awards Carroll $83.3 Million (Jan. 2024)' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Found Liable for Years of Civil Business Fraud',
                    shortLabel: 'Business Fraud',
                    description: 'A New York judge found Trump, his adult sons, and the Trump Organization liable for persistent civil fraud involving years of inflated asset valuations used to obtain favorable loan terms and insurance rates. The trial court initially ordered more than $450 million in penalties including interest. An appellate court later reduced the bond requirement while the case proceeds on appeal, but the underlying factual findings of fraudulent financial statements have not been overturned.',
                    sources: [
                        { url: 'https://ag.ny.gov/sites/default/files/2024-02/trump-judgment.pdf', text: 'New York AG — Final Judgment, People v. Trump Organization (Feb. 2024)' },
                        { url: 'https://apnews.com/article/trump-fraud-trial-verdict-new-york-2024', text: 'Associated Press — Judge Orders $355 Million Penalty (Feb. 2024)' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Used Pardon Power for Political Allies and Personal Associates',
                    shortLabel: 'Loyalty Pardons',
                    description: 'Trump used his presidential clemency power to pardon or commute sentences for a number of individuals with direct personal or political ties to him, including Michael Flynn, Roger Stone, Paul Manafort, and Steve Bannon — all of whom had been convicted or charged in connection with matters that touched on Trump\'s own conduct or political interests. Legal scholars and former officials noted the pattern raised serious concerns about self-interested use of the pardon power, even though presidents hold broad constitutional authority over clemency.',
                    sources: [
                        { url: 'https://www.justice.gov/pardon/pardons-granted-president-donald-trump-2017-2021', text: 'DOJ — Pardons Granted by President Donald Trump (2017–2021)' },
                        { url: 'https://www.brookings.edu/articles/trump-pardons-and-clemency/', text: 'Brookings Institution — Analysis of Trump Clemency Grants' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Travel Ban Targeting Primarily Muslim-Majority Countries',
                    shortLabel: 'Travel Ban',
                    description: 'Shortly after taking office in 2017, Trump signed executive orders restricting travel from several countries, the majority of which were Muslim-majority nations. Earlier versions were blocked in courts; a later revised version was upheld 5–4 by the Supreme Court in Trump v. Hawaii (2018). Critics pointed to Trump\'s own campaign statements calling for a "Muslim ban" as evidence of discriminatory intent. The ban separated families, blocked refugees, and affected students, workers, and travelers with legal visas.',
                    sources: [
                        { url: 'https://supreme.justia.com/cases/federal/us/585/18-280/', text: 'Trump v. Hawaii — Supreme Court Opinion (Jun. 2018)' },
                        { url: 'https://www.aclu.org/cases/trump-v-hawaii', text: 'ACLU — Trump v. Hawaii Case Summary' }
                    ]
                }
            ]
        },
        biden: {
            id: 'biden',
            firstName: 'Joseph R.',
            lastName: 'Biden',
            ordinal: 46,
            party: 'democrat',
            bars: [
                {
                    severity: 8,
                    title: 'Chaotic Afghanistan Withdrawal',
                    shortLabel: 'Afghanistan Exit',
                    description: 'Biden\'s execution of the U.S. withdrawal from Afghanistan in August 2021 resulted in the rapid collapse of the Afghan government, the Taliban retaking power within days, and a desperate evacuation from Kabul\'s airport. The Abbey Gate suicide bombing killed 13 U.S. service members and over 170 Afghan civilians. The Biden White House\'s own after-action review acknowledged serious planning failures, even while noting that the constraints of the Trump-era Doha Agreement limited options. Biden owned the final decisions on timing and execution.',
                    sources: [
                        { url: 'https://www.whitehouse.gov/wp-content/uploads/2023/04/afghanistan-war-lessons-learned.pdf', text: 'White House Afghanistan Lessons Learned Report (Apr. 2023)' },
                        { url: 'https://www.defense.gov/News/Releases/Release/Article/2806648/', text: 'DOD Statement on Abbey Gate Bombing Investigation (Feb. 2022)' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Pardoned Hunter Biden After Promising Not to Interfere',
                    shortLabel: 'Hunter Pardon',
                    description: 'Throughout his presidency, Biden repeatedly and publicly stated he would not interfere with Department of Justice decisions regarding his son Hunter Biden, who faced federal gun and tax charges. In December 2024, Biden issued a sweeping preemptive pardon covering Hunter\'s conduct from January 1, 2014 through December 1, 2024 — one of the broadest pardons in scope ever issued for a family member by a sitting president. The action directly contradicted his prior public commitments and presented an obvious conflict of interest regardless of one\'s view of the underlying prosecutions.',
                    sources: [
                        { url: 'https://www.justice.gov/pardon/grant-of-clemency-robert-hunter-biden', text: 'DOJ — Grant of Clemency for Robert Hunter Biden (Dec. 2024)' },
                        { url: 'https://apnews.com/article/hunter-biden-pardon-president-joe-biden-2024', text: 'Associated Press — Biden Pardons Son Hunter (Dec. 2024)' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Mishandled Classified Documents After Vice Presidency',
                    shortLabel: 'Classified Docs',
                    description: 'Special Counsel Robert Hur\'s 2024 report concluded that Biden "willfully retained and disclosed classified materials" after leaving the vice presidency, including sensitive documents related to Afghanistan found at his Delaware home and a Washington think tank. Hur declined to recommend criminal charges, citing factors including that a jury would likely find Biden sympathetic and that evidence of criminal intent fell short of proof beyond a reasonable doubt. The report nonetheless documented serious mishandling of national-security materials spanning years.',
                    sources: [
                        { url: 'https://www.justice.gov/storage/report-of-special-counsel-robert-k-hur.pdf', text: 'Special Counsel Robert Hur — Report on Biden Classified Documents (Feb. 2024)' },
                        { url: 'https://apnews.com/article/biden-classified-documents-hur-report-2024', text: 'Associated Press — Hur Report Summary (Feb. 2024)' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Student Loan Cancellation Exceeded Executive Authority',
                    shortLabel: 'Loan Overreach',
                    description: 'Biden\'s administration attempted to cancel approximately $430 billion in federal student loan debt by invoking the HEROES Act without congressional authorization. The Supreme Court struck down the plan 6–3 in Biden v. Nebraska (2023), ruling that the administration had invoked the "major questions doctrine" — executive agencies cannot claim broad authority over economically and politically significant decisions without clear congressional direction. Supporters characterized it as necessary relief; the Court\'s ruling was a significant rebuke of executive power claimed without legislative backing.',
                    sources: [
                        { url: 'https://supreme.justia.com/cases/federal/us/600/22-506/', text: 'Biden v. Nebraska — Supreme Court Opinion (Jun. 2023)' },
                        { url: 'https://www.cbo.gov/publication/58494', text: 'Congressional Budget Office — Cost Estimate of Student Loan Cancellation' }
                    ]
                },
                {
                    severity: 5,
                    title: 'OSHA Vaccine Mandate Blocked as Executive Overreach',
                    shortLabel: 'Vaccine Mandate',
                    description: 'Biden\'s OSHA issued an emergency temporary standard requiring employers with 100 or more employees to mandate COVID-19 vaccination or weekly testing and masking. The Supreme Court blocked it 6–3 in January 2022, finding that OSHA likely lacked the statutory authority to impose a broad public-health measure through workplace-safety law. The Court distinguished between targeted workplace hazards OSHA can regulate and a general societal risk that Congress had not clearly authorized the agency to address.',
                    sources: [
                        { url: 'https://supreme.justia.com/cases/federal/us/595/21a244/', text: 'NFIB v. OSHA — Supreme Court Opinion (Jan. 2022)' },
                        { url: 'https://www.osha.gov/coronavirus/ets2', text: 'OSHA Emergency Temporary Standard — Vaccination and Testing Rule' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Extended Eviction Moratorium Without Congressional Authorization',
                    shortLabel: 'Eviction Moratorium',
                    description: 'After Congress declined to renew the pandemic-era eviction moratorium in July 2021, the Biden administration directed the CDC to issue a new, targeted moratorium anyway. The Supreme Court struck it down, finding that the CDC had effectively claimed authority to do what Congress had just declined to do — and that such a broad economic intervention required explicit legislative authorization. Administration officials, including some White House lawyers, reportedly warned Biden the action was legally dubious before he proceeded.',
                    sources: [
                        { url: 'https://supreme.justia.com/cases/federal/us/594/21a23/', text: 'Alabama Association of Realtors v. HHS — Supreme Court Opinion (Aug. 2021)' },
                        { url: 'https://www.nytimes.com/2021/08/26/us/politics/eviction-moratorium-biden.html', text: 'New York Times — Biden Proceeding Despite Legal Warnings (Aug. 2021)' }
                    ]
                },
                {
                    severity: 5,
                    title: 'American Rescue Plan Contributed to Inflation',
                    shortLabel: 'ARP Inflation',
                    description: 'Biden\'s $1.9 trillion American Rescue Plan, passed in March 2021, injected significant demand-side stimulus into an economy already recovering faster than many projections anticipated. Economists including former Obama administration Treasury Secretary Larry Summers publicly warned at the time that the scale of the package risked overheating the economy. Subsequent inflation peaked at 9.1% in June 2022, the highest in four decades. While inflation had multiple causes — supply chain disruption, energy prices, and global conditions — a notable body of economic research concluded the ARP contributed to the surge.',
                    sources: [
                        { url: 'https://www.cbo.gov/publication/56975', text: 'CBO — Budgetary Effects of the American Rescue Plan (Mar. 2021)' },
                        { url: 'https://www.nber.org/papers/w29312', text: 'National Bureau of Economic Research — Fiscal Policy and Inflation (2021)' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Sustained U.S. Weapons Support to Israel During Gaza Conflict',
                    shortLabel: 'Gaza Arms Support',
                    description: 'Following the October 7, 2023 Hamas attacks, Biden backed Israel strongly and continued major arms transfers throughout the conflict. As the civilian death toll in Gaza exceeded 30,000 and humanitarian conditions deteriorated severely, the Biden administration\'s own State Department assessment in 2024 concluded it was "reasonable to assess" that Israel had used U.S.-provided weapons in ways inconsistent with international humanitarian law — but stopped short of a definitive finding that would have triggered statutory aid restrictions. The administration continued the transfers while the assessment was ongoing.',
                    sources: [
                        { url: 'https://www.state.gov/report-to-congress-pursuant-to-national-security-memorandum-20/', text: 'State Department — NSM-20 Report to Congress on Israel Arms Use (May 2024)' },
                        { url: 'https://apnews.com/article/israel-us-weapons-humanitarian-law-biden-2024', text: 'Associated Press — U.S. Report on Israeli Weapons Use (May 2024)' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Repeated Failures in Border and Immigration Management',
                    shortLabel: 'Border Failures',
                    description: 'Border encounters reached record highs during Biden\'s term, topping 2 million in fiscal year 2023. His administration struggled to sustain a coherent policy framework as it navigated court rulings, the end of Title 42, large-scale parole programs, and fluctuating asylum restrictions. The administration ultimately enacted restrictive asylum measures in 2024 that critics on the left said mirrored Trump-era policies, while critics on the right said the earlier openness had created the crisis those restrictions were now trying to address.',
                    sources: [
                        { url: 'https://www.cbp.gov/newsroom/stats/nationwide-encounters', text: 'CBP — Nationwide Encounters Data (2021–2024)' },
                        { url: 'https://www.dhs.gov/sites/default/files/2024-06/24_0604_s1-southwest-border-report.pdf', text: 'DHS — Southwest Border Report (2024)' }
                    ]
                },
                {
                    severity: 3,
                    title: 'Fossil Fuel Leasing Pauses Challenged in Court',
                    shortLabel: 'Energy Leasing Pause',
                    description: 'Early in his term, Biden signed an executive order pausing new oil and gas leasing on federal lands as part of a broader climate agenda. Federal courts blocked the pause, finding Biden had likely exceeded his statutory authority under the Mineral Leasing Act. Later in his term, the administration also paused approval of new LNG export terminals, which industry groups challenged as economically harmful and beyond agency authority. Courts and critics across the political spectrum questioned whether these moves fell within the executive\'s unilateral power.',
                    sources: [
                        { url: 'https://www.doi.gov/pressreleases/court-blocks-biden-administration-pause-oil-gas-leasing', text: 'DOI — Statement on Leasing Pause Court Order (Jun. 2021)' },
                        { url: 'https://apnews.com/article/biden-lng-exports-pause-climate-2024', text: 'Associated Press — Biden Pauses LNG Export Approvals (Jan. 2024)' }
                    ]
                }
            ]
        },
        // ── Scaffolded presidents — empty bars, ready to fill in ──
        obama: {
            id: 'obama',
            firstName: 'Barack H.',
            lastName: 'Obama',
            ordinal: 44,
            party: 'democrat',
            bars: []
        },
        gwBush: {
            id: 'gwBush',
            firstName: 'George W.',
            lastName: 'Bush',
            displayName: 'G.W. Bush',
            ordinal: 43,
            party: 'republican',
            bars: []
        },
        clinton: {
            id: 'clinton',
            firstName: 'William J.',
            lastName: 'Clinton',
            ordinal: 42,
            party: 'democrat',
            bars: []
        }
    };

    /* --------------------------------------------------------------------------
       Selection — which president is currently shown on each side. The
       pickers mutate this. Could later be persisted (localStorage, URL
       params) but right now it just resets to the default on each load.
       -------------------------------------------------------------------------- */
    const selection = {
        left: 'biden',
        right: 'trump'
    };

    /* --------------------------------------------------------------------------
       formatOrdinal — turn 46 into "46<sup>th</sup> President" or
       [45, 47] into "45<sup>th</sup> & 47<sup>th</sup> President".

       Returns HTML (not plain text) because the styling of the suffix
       relies on the <sup> tag — see `.name-detail sup` in styles.css.
       Callers must use innerHTML, not textContent. The data is author-
       controlled (defined above in this file), so this is safe.
       -------------------------------------------------------------------------- */
    function formatOrdinal(n) {
        function suffix(num) {
            const lastDigit = num % 10;
            const lastTwo = num % 100;
            // 11/12/13 are the special cases that don't follow the
            // last-digit rule — they all take 'th'.
            if (lastDigit === 1 && lastTwo !== 11) return 'st';
            if (lastDigit === 2 && lastTwo !== 12) return 'nd';
            if (lastDigit === 3 && lastTwo !== 13) return 'rd';
            return 'th';
        }
        function fmt(num) {
            return num + '<sup>' + suffix(num) + '</sup>';
        }
        if (Array.isArray(n)) {
            return n.map(fmt).join(' &amp; ') + ' President';
        }
        return fmt(n) + ' President';
    }

    /* --------------------------------------------------------------------------
       Render — build bar markup from the data above and inject into the
       containers. Runs once on script load (the script is `defer`-ed in
       the HTML, so the DOM is parsed by the time we get here) and again
       whenever `selection[side]` changes via a picker.

       Animation delays are set inline per bar so that adding a 6th, 7th,
       Nth bar Just Works without touching the CSS.
       -------------------------------------------------------------------------- */

    // Animation timing — mirrors what the old CSS nth-child rules produced
    const BAR_FILL_BASE_DELAY = 0.15;        // first bar's --bar-fill-delay
    const SEVERITY_NUMBER_BASE_DELAY = 0.85; // first bar's severity number
    const LABEL_BASE_DELAY = 0.95;           // first bar's outer label
    const STAGGER_STEP = 0.13;               // gap between consecutive bars

    function escapeHtml(str) {
        return String(str)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function renderSourcesList(sources) {
        return sources.map(function (src) {
            return '<li><a href="' + escapeHtml(src.url) + '" rel="noopener">' +
                escapeHtml(src.text) + '</a></li>';
        }).join('');
    }

    function renderBar(bar, index, side) {
        // Per-side ID prefix so left and right never collide
        const idPrefix = side === 'left' ? 'L' : 'R';
        const labelId = 'label-' + idPrefix + (index + 1);
        const detailId = 'detail-' + idPrefix + (index + 1);

        // Per-bar animation delays — replaces the old static nth-child rules
        const fillDelay = (BAR_FILL_BASE_DELAY + index * STAGGER_STEP).toFixed(2) + 's';
        const numberDelay = (SEVERITY_NUMBER_BASE_DELAY + index * STAGGER_STEP).toFixed(2) + 's';
        const labelDelay = (LABEL_BASE_DELAY + index * STAGGER_STEP).toFixed(2) + 's';

        // Label and bar render in opposite DOM order per side so the label
        // sits on the OUTSIDE of the bar (away from the centerline).
        const labelSpan =
            '<span class="bar-label-outer" id="' + labelId + '" style="animation-delay: ' + labelDelay + ';">' +
            escapeHtml(bar.title) +
            '</span>';

        const buttonHtml =
            '<button class="bar-fill" type="button" aria-expanded="false"' +
            ' aria-controls="' + detailId + '"' +
            ' aria-labelledby="' + labelId + '"' +
            ' data-title="' + escapeHtml(bar.title) + '"' +
            ' style="--severity: ' + bar.severity + '; animation-delay: ' + fillDelay + ';">' +
            '<span class="severity-number" style="animation-delay: ' + numberDelay + ';">' + bar.severity + '</span>' +
            '<span class="bar-label-inner">' + escapeHtml(bar.shortLabel) + '</span>' +
            '</button>';

        const rowHtml = side === 'left'
            ? '<div class="bar-row">' + labelSpan + buttonHtml + '</div>'
            : '<div class="bar-row">' + buttonHtml + labelSpan + '</div>';

        const detailHtml =
            '<div class="bar-detail" id="' + detailId + '" hidden>' +
            '<div class="bar-detail-inner">' +
            '<h3 class="detail-title">' + escapeHtml(bar.title) + '</h3>' +
            '<p class="detail-description">' + escapeHtml(bar.description) + '</p>' +
            '<div class="detail-sources">' +
            '<h4 class="sources-heading">Sources</h4>' +
            '<ol class="sources-list">' + renderSourcesList(bar.sources) + '</ol>' +
            '</div>' +
            '</div>' +
            '</div>';

        const article = document.createElement('article');
        article.className = 'bar';
        article.dataset.side = side;
        article.innerHTML = rowHtml + detailHtml;
        return article;
    }

    function renderSide(side) {
        const container = document.getElementById('bars-' + side);
        if (!container) return;

        // Look up the president currently assigned to this side
        const presidentId = selection[side];
        const president = presidents[presidentId];
        if (!president) {
            // Defensive: if the selection points at an unknown president
            // (e.g. typo, or future deletion), clear the side rather than
            // crashing. Keeps the rest of the page working.
            container.replaceChildren();
            return;
        }

        // Sort by severity descending — source order in bars no longer matters
        const sorted = president.bars.slice().sort(function (a, b) {
            return b.severity - a.severity;
        });

        const frag = document.createDocumentFragment();
        sorted.forEach(function (bar, i) {
            frag.appendChild(renderBar(bar, i, side));
        });

        container.replaceChildren(frag);
    }

    /* --------------------------------------------------------------------------
       Name badge — populate the existing .name-badge spans inside each
       side from the currently-selected president's data.

       The HTML keeps the badge structure (the spans with their classes)
       but ships them empty. This function fills them in. Re-run on every
       selection change.
       -------------------------------------------------------------------------- */
    function renderNameBadge(side) {
        const sideEl = document.querySelector('.side-' + side);
        if (!sideEl) return;
        const badge = sideEl.querySelector('.name-badge');
        if (!badge) return;

        const president = presidents[selection[side]];
        if (!president) {
            // Mirror the renderSide defensive path — clear rather than crash.
            badge.querySelector('.name-first').textContent = '';
            badge.querySelector('.last-name').textContent = '';
            badge.querySelector('.name-detail').textContent = '';
            // Reset section landmark to a generic label.
            sideEl.setAttribute('aria-label', side === 'left' ? 'Left president' : 'Right president');
            return;
        }

        // textContent for plain strings (auto-escapes anything weird).
        badge.querySelector('.name-first').textContent = president.firstName;
        badge.querySelector('.last-name').textContent = president.lastName;
        // innerHTML for the ordinal because formatOrdinal returns markup
        // (<sup> tags). Safe because the input is author-controlled data.
        badge.querySelector('.name-detail').innerHTML = formatOrdinal(president.ordinal);
        // Update the section landmark so screen readers navigating by
        // landmark hear the actual president's name (e.g. "Joseph R. Biden")
        // rather than a generic "Left president". Re-announces on change.
        sideEl.setAttribute('aria-label', president.firstName + ' ' + president.lastName);
        // Drive the side's color theme. The CSS [data-party="..."] block
        // defines --party-* variables; the side's background gradient,
        // radial accent, bar fills, and detail accent border all read
        // those vars, so a single attribute swap repaints the side.
        sideEl.dataset.party = president.party;
    }

    /* --------------------------------------------------------------------------
       Picker — render the <option>s inside an existing <select>.

       The select element itself stays put across re-renders (preserving
       the change listener attached once below); only its options get
       replaced. Each call recomputes which presidents to show:

         - Skip the one already chosen on the OTHER side (filter rule)
         - Mark this side's current selection as `selected`
         - Use displayName when present (lets "G.W. Bush" disambiguate
           from a future H.W. Bush without changing his lastName)
       -------------------------------------------------------------------------- */
    function renderPicker(side) {
        const select = document.getElementById('picker-' + side);
        if (!select) return;

        const otherSide = side === 'left' ? 'right' : 'left';
        const excludeId = selection[otherSide];
        const currentId = selection[side];

        // Drive the picker cell's border tint via data-party. The
        // .president-picker base rule reads rgba(var(--party-rgb), 0.45),
        // so changing the wrapper's data-party recolors the border.
        const cell = select.parentElement;
        const currentPresident = presidents[currentId];
        if (cell && currentPresident) {
            cell.dataset.party = currentPresident.party;
        }

        // Wipe and rebuild — small enough that this is simpler than diffing
        select.replaceChildren();

        Object.values(presidents).forEach(function (p) {
            if (p.id === excludeId) return; // hidden because they're on the other side
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.displayName || p.lastName;
            if (p.id === currentId) opt.selected = true;
            select.appendChild(opt);
        });
    }

    /* --------------------------------------------------------------------------
       Picker change handler — orchestrates the four updates that need
       to happen when a side switches presidents:

         1. Update `selection` (the source of truth)
         2. Re-render this side's bars
         3. Re-render this side's name badge
         4. Re-render the OTHER side's picker, so the new pick is filtered
            out of its option list

       Note that step 4 does NOT re-render this side's own picker. The
       current selection in this side's <select> is already correct
       (the user just chose it), and the option list doesn't need to
       change because the OTHER side's selection didn't change.
       -------------------------------------------------------------------------- */
    function onPickerChange(side, newId) {
        if (selection[side] === newId) return; // no-op
        if (!presidents[newId]) return;        // defensive: unknown id

        selection[side] = newId;
        renderSide(side);
        renderNameBadge(side);
        renderPicker(side === 'left' ? 'right' : 'left');
    }

    // Wire up picker change listeners ONCE. The select elements themselves
    // don't get re-created on selection changes — only their options — so
    // these listeners survive every re-render.
    ['left', 'right'].forEach(function (side) {
        const select = document.getElementById('picker-' + side);
        if (!select) return;
        select.addEventListener('change', function (e) {
            onPickerChange(side, e.target.value);
        });
    });

    // Initial render — bars, badges, pickers (in that order, but it
    // doesn't strictly matter; they all read from `selection`).
    renderSide('left');
    renderSide('right');
    renderNameBadge('left');
    renderNameBadge('right');
    // Reveal the name badges now that they're populated. Done before
    // the picker render so an error in renderPicker doesn't strand the
    // badges in their pre-hydration hidden state — a half-broken page
    // shouldn't leave the most prominent text invisible.
    document.body.classList.add('hydrated');
    renderPicker('left');
    renderPicker('right');

    /* --------------------------------------------------------------------------
       Everything below is the original interaction code, unchanged.
       -------------------------------------------------------------------------- */

    const MOBILE_QUERY = '(max-width: 1000px)';
    const mql = window.matchMedia(MOBILE_QUERY);
    const isMobile = () => mql.matches;

    // Modal elements (now a native <dialog>)
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalDescription = document.getElementById('modal-description');
    const modalSeverity = document.getElementById('modal-severity');
    const modalSourcesList = document.getElementById('modal-sources-list');

    // Kept in sync with the .modal-sheet transition duration in CSS
    const MODAL_TRANSITION_MS = 400;

    // Track currently expanded bar (desktop) so we can collapse it
    let currentlyExpanded = null;
    // Element that had focus before the modal opened, restored on close
    let lastFocusedBeforeModal = null;

    /* --------------------------------------------------------------------------
       Click handling — delegated from the document so dynamically-added bars
       (e.g. from the future moderation queue) start working immediately
       without needing to re-bind handlers.
       -------------------------------------------------------------------------- */
    document.addEventListener('click', (e) => {
        const fill = e.target.closest('.bar-fill');
        if (!fill) return;
        const bar = fill.closest('.bar');
        if (!bar) return;

        if (isMobile()) {
            openModal(bar);
        } else {
            toggleExpand(bar);
        }
    });

    /* --------------------------------------------------------------------------
       Desktop: inline expansion
       -------------------------------------------------------------------------- */
    function toggleExpand(bar) {
        const fill = bar.querySelector('.bar-fill');
        const detail = bar.querySelector('.bar-detail');
        const isOpen = bar.classList.contains('expanded');

        // Single-open behavior — collapse any other open bar first
        if (currentlyExpanded && currentlyExpanded !== bar) {
            collapseBar(currentlyExpanded);
        }

        if (isOpen) {
            collapseBar(bar);
            currentlyExpanded = null;
        } else {
            bar.classList.add('expanded');
            fill.setAttribute('aria-expanded', 'true');
            if (detail) detail.removeAttribute('hidden');
            currentlyExpanded = bar;
        }
    }

    function collapseBar(bar) {
        const fill = bar.querySelector('.bar-fill');
        const detail = bar.querySelector('.bar-detail');
        bar.classList.remove('expanded');
        fill.setAttribute('aria-expanded', 'false');

        if (detail) {
            // The detail has THREE concurrent transitions (max-height,
            // margin-top, opacity). transitionend fires once per property,
            // and opacity finishes first. Filter on propertyName so we
            // wait for max-height to complete before re-hiding the element
            // — and only THEN remove the listener. Previously the listener
            // tore itself down on the first event regardless of property,
            // so the [hidden] attribute often never got reapplied.
            const onEnd = (e) => {
                if (e.propertyName !== 'max-height') return;
                detail.removeEventListener('transitionend', onEnd);
                if (!bar.classList.contains('expanded')) {
                    detail.setAttribute('hidden', '');
                }
            };
            detail.addEventListener('transitionend', onEnd);
        }
    }

    /* --------------------------------------------------------------------------
       Mobile: native <dialog> modal
       -------------------------------------------------------------------------- */
    function openModal(bar) {
        const side = bar.dataset.side;
        const fill = bar.querySelector('.bar-fill');
        const title = fill.dataset.title || 'Detail';
        const severity = fill.style.getPropertyValue('--severity').trim();
        const detail = bar.querySelector('.bar-detail');
        const description = detail ? detail.querySelector('.detail-description')?.textContent || '' : '';
        const sources = detail ? detail.querySelectorAll('.sources-list li') : [];

        // Drive the modal's color theme from the bar's president, not the
        // bar's side. Means the modal sheet border + severity number both
        // adopt the right party color whichever side opened it. Defensive
        // empty string clears any stale value if the lookup ever fails.
        const president = presidents[selection[side]];
        modal.dataset.party = president ? president.party : '';

        modalTitle.textContent = title;
        modalDescription.textContent = description;
        modalSeverity.textContent = severity;

        // Rebuild sources list — cloneNode preserves nested elements
        // exactly without an innerHTML re-parse round-trip, and would
        // also preserve any event listeners we attach in the future.
        modalSourcesList.replaceChildren();
        sources.forEach((srcLi) => {
            modalSourcesList.appendChild(srcLi.cloneNode(true));
        });

        // Capture focus so we can restore it when the modal closes
        lastFocusedBeforeModal = document.activeElement;

        modal.showModal();
        // Trigger entrance animation on next frame — adding the class in the
        // same frame as showModal() would skip the transition because the
        // browser hasn't yet committed the dialog's "from" state.
        requestAnimationFrame(() => modal.classList.add('is-open'));
    }

    function closeModal() {
        modal.classList.remove('is-open');
        // Wait for the slide-out + backdrop fade to finish before actually
        // closing the dialog, otherwise it snaps to display:none mid-frame.
        setTimeout(() => {
            if (modal.open) modal.close();
            if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
                lastFocusedBeforeModal.focus();
            }
            lastFocusedBeforeModal = null;
        }, MODAL_TRANSITION_MS);
    }

    // Click on the backdrop (which bubbles to the dialog with target===dialog)
    // or on any element marked data-modal-close (the close button).
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
            return;
        }
        if (e.target.closest('[data-modal-close]')) {
            closeModal();
        }
    });

    // ESC dismissal — <dialog> fires a `cancel` event before closing. We
    // preventDefault so we can run our animated close path instead of the
    // dialog snapping closed instantly.
    modal.addEventListener('cancel', (e) => {
        e.preventDefault();
        closeModal();
    });

    /* --------------------------------------------------------------------------
       Breakpoint crossings — listen directly to matchMedia's `change` event
       instead of polling resize. Fires only when the breakpoint is actually
       crossed, no manual lastIsMobile tracking required.
       -------------------------------------------------------------------------- */
    mql.addEventListener('change', () => {
        if (currentlyExpanded) {
            collapseBar(currentlyExpanded);
            currentlyExpanded = null;
        }
        if (modal.open) {
            closeModal();
        }
    });
})();