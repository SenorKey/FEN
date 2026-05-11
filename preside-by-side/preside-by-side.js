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
         title:       String — full title (detail panel + modal heading)
         shortLabel:  String — 2–3 words max, shown on the bar on every breakpoint
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
            bars: [
                {
                    severity: 8,
                    title: 'Expanded Drone Warfare with Civilian Casualties',
                    shortLabel: 'Drone Strikes',
                    description: 'Obama dramatically expanded the use of drone strikes in Pakistan, Yemen, Somalia, and Libya — countries where the U.S. was not officially at war. The administration\'s own 2016 disclosure acknowledged 64–116 noncombatant deaths from 473 counterterrorism strikes between 2009 and 2015, while independent monitors such as the Bureau of Investigative Journalism estimated civilian casualties many times higher. Critics argued the program normalized extrajudicial killing, lacked transparency, and set a precedent for unchecked executive war-making.',
                    sources: [
                        { url: 'https://obamawhitehouse.archives.gov/the-press-office/2016/07/01/executive-order-united-states-policy-pre-and-post-strike-measures', text: 'Obama White House — Executive Order on Drone Strike Policy and Civilian Casualty Disclosure (Jul. 2016)' },
                        { url: 'https://www.thebureauinvestigates.com/projects/drone-war', text: 'Bureau of Investigative Journalism — Drone War Casualty Database' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Libya Intervention and Collapse into Instability',
                    shortLabel: 'Libya Intervention',
                    description: 'In 2011, the Obama administration joined a NATO military intervention in Libya, initially authorized under a U.N. resolution to protect civilians and enforce a no-fly zone. While Muammar Gaddafi was removed from power, the U.S. and coalition partners made little provision for post-conflict stabilization. Libya subsequently descended into civil war, militia fragmentation, and a power vacuum exploited by extremist groups. Obama himself later described the failure to plan for the aftermath as his "worst mistake" in office.',
                    sources: [
                        { url: 'https://crsreports.congress.gov/product/pdf/RL/RL33142', text: 'Congressional Research Service — Libya: Examination of the U.S. Role in NATO Operations' },
                        { url: 'https://www.theatlantic.com/magazine/archive/2016/04/the-obama-doctrine/471525/', text: 'The Atlantic — Obama\'s "Worst Mistake" Comment on Libya (Apr. 2016)' }
                    ]
                },
                {
                    severity: 7,
                    title: 'NSA Bulk Surveillance of Americans\' Phone Records',
                    shortLabel: 'NSA Surveillance',
                    description: 'Disclosures by NSA contractor Edward Snowden in 2013 revealed that under Obama the agency had been collecting bulk telephone metadata on millions of Americans under Section 215 of the Patriot Act. The Privacy and Civil Liberties Oversight Board later concluded that the Section 215 program lacked a viable legal foundation and had produced minimal counterterrorism value that could not have been obtained through less intrusive means. The program became one of the most significant civil-liberties controversies of the Obama era.',
                    sources: [
                        { url: 'https://www.pclob.gov/library/215-Report_on_the_Telephone_Records_Program.pdf', text: 'Privacy and Civil Liberties Oversight Board — Report on the Section 215 Telephone Records Program (Jan. 2014)' },
                        { url: 'https://www.aclu.org/cases/aclu-v-clapper', text: 'ACLU — ACLU v. Clapper: NSA Mass Phone Surveillance Challenge' }
                    ]
                },
                {
                    severity: 5,
                    title: 'IRS Targeting of Conservative Tax-Exempt Applications',
                    shortLabel: 'IRS Targeting',
                    description: 'The IRS was found to have used inappropriate political criteria — including the terms "Tea Party" and "Patriots" — to flag applications for tax-exempt status for heightened scrutiny and lengthy delays. The Treasury Inspector General for Tax Administration concluded that the criteria were inappropriate and that some applications remained unresolved for hundreds of days, spanning election cycles. Obama called the conduct "inexcusable," but the abuses occurred under his administration\'s watch and fueled lasting accusations of politically motivated enforcement.',
                    sources: [
                        { url: 'https://www.treasury.gov/tigta/auditreports/2013reports/201310053fr.pdf', text: 'Treasury Inspector General for Tax Administration — IRS Exempt Organizations Targeting Report (May 2013)' },
                        { url: 'https://www.justice.gov/opa/pr/justice-department-closes-investigation-irs-processing-tea-party-applications', text: 'DOJ — Statement on Closing IRS Targeting Investigation (Oct. 2015)' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Operation Fast and Furious',
                    shortLabel: 'Fast & Furious',
                    description: 'An ATF operation called Fast and Furious allowed illegal firearms purchases to proceed with the intention of tracking weapons to Mexican cartel networks, but agents lost track of approximately 2,000 guns. Weapons from the operation later turned up at crime scenes in both the U.S. and Mexico, including near the murder scene of U.S. Border Patrol Agent Brian Terry. A DOJ Inspector General review found serious failures in oversight, judgment, and internal communication within ATF and DOJ leadership.',
                    sources: [
                        { url: 'https://oig.justice.gov/reports/2012/s1209.pdf', text: 'DOJ Office of Inspector General — A Review of ATF\'s Operation Fast and Furious (Sep. 2012)' },
                        { url: 'https://oversight.house.gov/report/final-report-operation-fast-furious/', text: 'House Oversight Committee — Final Report on Operation Fast and Furious (Jul. 2012)' }
                    ]
                },
                {
                    severity: 4,
                    title: 'HealthCare.gov Rollout Failure and "Keep Your Plan" Broken Promise',
                    shortLabel: 'ACA Rollout',
                    description: 'The October 2013 launch of HealthCare.gov, the federal marketplace for the Affordable Care Act, was marked by widespread technical failures that prevented millions of Americans from enrolling for weeks. An HHS Inspector General review cited poor contractor oversight and failed testing as root causes. Separately, Obama\'s repeated promise — "if you like your health plan, you can keep it" — proved false for millions of individual-market policyholders whose plans were canceled for not meeting ACA minimum standards. PolitiFact named it their 2013 "Lie of the Year."',
                    sources: [
                        { url: 'https://oig.hhs.gov/oei/reports/oei-06-14-00350.pdf', text: 'HHS Office of Inspector General — HealthCare.gov: CMS Management of the Federal Marketplace (Feb. 2016)' },
                        { url: 'https://www.politifact.com/article/2013/dec/12/lie-year-if-you-like-your-health-care-plan-keep-it/', text: 'PolitiFact — Lie of the Year: "If You Like Your Health Care Plan, You Can Keep It" (Dec. 2013)' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Record-High Deportations and Immigration Enforcement',
                    shortLabel: 'Mass Deportations',
                    description: 'Obama\'s administration oversaw more formal deportations than any previous president, with removal figures peaking above 400,000 per year in the early 2010s. Enforcement programs like Secure Communities expanded the pipeline from local law enforcement to federal immigration authorities. Immigration advocates called Obama the "Deporter in Chief," arguing that the enforcement machinery separated families and targeted long-established community members. The administration later introduced DACA, though critics argued this came only after years of damage to immigrant communities.',
                    sources: [
                        { url: 'https://www.migrationpolicy.org/article/obama-record-deportations-deporter-chief-or-not', text: 'Migration Policy Institute — Obama\'s Record Deportations: Deporter in Chief or Not? (Jan. 2014)' },
                        { url: 'https://www.dhs.gov/immigration-statistics/yearbook/2016/table39', text: 'DHS — Yearbook of Immigration Statistics: Removals by Year' }
                    ]
                },
                {
                    severity: 6,
                    title: 'VA Wait-Time Scandal',
                    shortLabel: 'VA Scandal',
                    description: 'In 2014, investigations revealed that VA medical facilities — most prominently in Phoenix — had systematically falsified appointment wait-time data to conceal how long veterans were waiting for care. The VA Inspector General identified gross mismanagement, widespread data manipulation, and links to patient harm. At least 40 veterans died while waiting for appointments at the Phoenix VA alone, though the IG noted causal attribution was difficult to establish definitively. Obama accepted the resignation of VA Secretary Eric Shinseki and signed reform legislation, but the scandal exposed deep systemic failures.',
                    sources: [
                        { url: 'https://www.va.gov/oig/pubs/VAOIG-14-02603-267.pdf', text: 'VA Office of Inspector General — Phoenix VA Health Care System Patient Wait Times (Aug. 2014)' },
                        { url: 'https://www.congress.gov/113/plaws/publ146/PLAW-113publ146.pdf', text: 'Veterans Access, Choice, and Accountability Act of 2014 (Aug. 2014)' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Aggressive Leak Investigations and Press Freedom Concerns',
                    shortLabel: 'Press Surveillance',
                    description: 'The Obama Justice Department pursued more leak investigations under the Espionage Act than all prior administrations combined. In 2013, it was revealed that DOJ had secretly obtained two months of phone records from Associated Press journalists in connection with a leak investigation — the AP called it a massive and unprecedented intrusion into newsgathering. The Committee to Protect Journalists produced a landmark report in 2013 concluding that the administration\'s war on leaks had created a climate of fear damaging to press freedom.',
                    sources: [
                        { url: 'https://cpj.org/reports/2013/10/obama-and-the-press-us-leaks-surveillance-post-911/', text: 'Committee to Protect Journalists — The Obama Administration and the Press (Oct. 2013)' },
                        { url: 'https://apnews.com/article/government-and-politics-ap-top-news-north-america-media-us-news-f5e36d0f87b14e96a7c2f8e5d3b9b40f', text: 'Associated Press — Statement on DOJ Phone Records Seizure (May 2013)' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Failed to Close Guantánamo Bay',
                    shortLabel: 'Guantánamo',
                    description: 'Obama signed an executive order in his first week in office directing the closure of the Guantánamo Bay detention facility within one year. He never achieved it. While he reduced the detainee population significantly — from 242 when he took office to 41 when he left — Congress passed legislation blocking detainee transfers to the U.S. and impeding closures. Critics across the political spectrum faulted him: civil libertarians saw the continued detention of uncharged prisoners as a fundamental rights failure; others argued he lacked the political will to fight for closure when it mattered most.',
                    sources: [
                        { url: 'https://www.aclu.org/report/closing-guantanamo-obamas-failed-promise', text: 'ACLU — Closing Guantánamo: Obama\'s Failed Promise' },
                        { url: 'https://crsreports.congress.gov/product/pdf/R/R40139', text: 'Congressional Research Service — Closing the Guantánamo Detention Facility (Jan. 2017)' }
                    ]
                }
            ]
        },
        gwBush: {
            id: 'gwBush',
            firstName: 'George W.',
            lastName: 'Bush',
            displayName: 'G.W. Bush',
            ordinal: 43,
            party: 'republican',
            bars: [
                {
                    severity: 10,
                    title: 'Invaded Iraq Based on False WMD Claims',
                    shortLabel: 'Iraq WMD War',
                    description: 'The Bush administration made the case for invading Iraq in 2003 primarily on the claim that Saddam Hussein possessed weapons of mass destruction and posed an imminent threat. No such weapons were found. A Senate Intelligence Committee report concluded that major prewar intelligence judgments were overstated or unsupported by underlying evidence, and that the public case for war went beyond what the intelligence actually showed. Brown University\'s Costs of War project estimates hundreds of thousands of deaths across post-9/11 wars. It remains one of the most consequential foreign policy decisions in modern American history.',
                    sources: [
                        { url: 'https://www.intelligence.senate.gov/sites/default/files/publications/108301.pdf', text: 'Senate Intelligence Committee — Report on Prewar Intelligence Assessments About Iraq (Jul. 2004)' },
                        { url: 'https://watson.brown.edu/costsofwar/figures/2021/irdirect-war-deaths', text: 'Brown University Costs of War Project — Iraq War Death Toll Estimates' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Iraq War Civilian Death Toll and Regional Destabilization',
                    shortLabel: 'Iraq Civilian Deaths',
                    description: 'Separate from the false WMD justification, the Iraq War itself caused catastrophic civilian harm and geopolitical instability. Brown University\'s Costs of War project estimated at least 134,000 Iraqi civilians killed by direct war violence from 2003 to 2013, acknowledging this likely undercounts indirect deaths from displacement, infrastructure destruction, and disease. The war fueled sectarian violence, displaced millions, and created conditions that contributed directly to the rise of extremist groups including ISIS. The region\'s instability persisted for decades.',
                    sources: [
                        { url: 'https://watson.brown.edu/costsofwar/files/cow/imce/papers/2013/Civilians%20in%20Iraq%27s%20War%2C%20Hagopian%20et%20al%2C%20Costs%20of%20War.pdf', text: 'Brown University Costs of War — Civilian Deaths in Iraq (2013)' },
                        { url: 'https://www.ibc.org/', text: 'Iraq Body Count — Documented Civilian Deaths Database' }
                    ]
                },
                {
                    severity: 9,
                    title: 'CIA Torture and "Enhanced Interrogation" Program',
                    shortLabel: 'CIA Torture',
                    description: 'The Bush administration authorized a CIA detention and interrogation program that included waterboarding, sleep deprivation extended to 180 hours, confinement in small boxes, stress positions, and other techniques widely classified as torture under international law. The Senate Intelligence Committee\'s 2014 torture report — based on review of over six million internal documents — concluded that the techniques were more brutal than the CIA had represented to policymakers, that the program was not an effective means of acquiring actionable intelligence, and that the CIA actively misled Congress and the White House about its scope and results.',
                    sources: [
                        { url: 'https://www.intelligence.senate.gov/sites/default/files/publications/CRPT-113srpt288.pdf', text: 'Senate Intelligence Committee — Report on the CIA\'s Detention and Interrogation Program (Dec. 2014)' },
                        { url: 'https://www.aclu.org/report/torture-report', text: 'ACLU — Summary of the Senate CIA Torture Report' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Abu Ghraib Prisoner Abuse',
                    shortLabel: 'Abu Ghraib',
                    description: 'In 2004, photographs became public showing U.S. military personnel abusing, humiliating, and torturing Iraqi detainees at the Abu Ghraib prison. Acts included sexual humiliation, physical assault, and degrading treatment. While Bush condemned the abuse and several low-ranking soldiers were prosecuted, the Army\'s own Taguba Report found the abuses were not isolated and reflected broader failures in command oversight and detention policy. Human Rights Watch argued that administration decisions to sidestep the Geneva Conventions helped create the permissive climate in which the abuse occurred.',
                    sources: [
                        { url: 'https://www.thetorturedatabase.org/files/foia_subsite/pdfs/DODDOA019464.pdf', text: 'Army Taguba Report — Investigation of the 800th Military Police Brigade (May 2004)' },
                        { url: 'https://www.hrw.org/report/2005/09/25/getting-away-torture/bush-administration-and-mistreatment-detainees', text: 'Human Rights Watch — Getting Away with Torture (Sep. 2005)' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Warrantless NSA Surveillance Program',
                    shortLabel: 'Warrantless Wiretaps',
                    description: 'Shortly after September 11, Bush secretly authorized the NSA to conduct warrantless surveillance of communications involving people inside the United States, bypassing the Foreign Intelligence Surveillance Act court process established by Congress in 1978. The program was exposed by the New York Times in 2005. Bush acknowledged and defended it as a wartime necessity, but legal scholars, civil-liberties organizations, and members of Congress from both parties argued it was an illegal exercise of executive power and a violation of the statutory framework Congress had specifically created for this purpose.',
                    sources: [
                        { url: 'https://www.aclu.org/cases/aclu-v-nsa-challenge-illegal-spying', text: 'ACLU — ACLU v. NSA: Legal Challenge to Warrantless Wiretapping' },
                        { url: 'https://www.nytimes.com/2005/12/16/politics/bush-lets-us-spy-on-callers-without-courts.html', text: 'New York Times — Bush Lets U.S. Spy on Callers Without Courts (Dec. 2005)' }
                    ]
                },
                {
                    severity: 5,
                    title: 'USA PATRIOT Act and Expansion of Surveillance Powers',
                    shortLabel: 'PATRIOT Act',
                    description: 'Weeks after September 11, Bush signed the USA PATRIOT Act into law, dramatically expanding government surveillance authorities. The law broadened access to business records, permitted "roving" wiretaps, reduced judicial oversight requirements, and expanded the definition of domestic terrorism. Civil-liberties organizations argued the Act enabled mass surveillance and undermined constitutional protections. Sections of the law later became central to NSA bulk collection controversies under subsequent administrations, and Congress eventually allowed several provisions to expire or be significantly reformed.',
                    sources: [
                        { url: 'https://www.aclu.org/report/surveillance-under-usa-patriot-act', text: 'ACLU — Surveillance Under the USA PATRIOT Act' },
                        { url: 'https://crsreports.congress.gov/product/pdf/RL/RL31377', text: 'Congressional Research Service — The USA PATRIOT Act: A Legal Analysis (Apr. 2002)' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Hurricane Katrina Federal Response Failure',
                    shortLabel: 'Katrina Response',
                    description: 'When Hurricane Katrina struck the Gulf Coast in August 2005 and the levee system protecting New Orleans catastrophically failed, the federal response was widely condemned as slow, disorganized, and inadequate. Over 1,800 people died. Thousands were stranded for days at the Superdome and Convention Center without adequate food, water, or medical care. Even the Bush White House\'s own post-storm review — "The Federal Response to Hurricane Katrina: Lessons Learned" — acknowledged major failures in preparation, coordination, and execution across federal agencies, including FEMA.',
                    sources: [
                        { url: 'https://georgewbush-whitehouse.archives.gov/reports/katrina-lessons-learned/', text: 'Bush White House — The Federal Response to Hurricane Katrina: Lessons Learned (Feb. 2006)' },
                        { url: 'https://www.dhs.gov/xlibrary/assets/katrina/Katrina-OIG-0706.pdf', text: 'DHS Office of Inspector General — A Performance Review of FEMA\'s Disaster Management Activities (Mar. 2006)' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Failure to Act on Pre-9/11 Intelligence Warnings',
                    shortLabel: 'Pre-9/11 Warnings',
                    description: 'On August 6, 2001, Bush received a Presidential Daily Brief titled "Bin Ladin Determined To Strike in US," warning of al-Qaeda\'s intention to conduct attacks inside the country, potentially including hijackings. No significant new action was taken in response. The 9/11 Commission documented widespread intelligence, coordination, and policy failures across multiple agencies in the months before the attacks, and concluded that the government did not marshal the institutional response the threat level demanded. While failures spanned multiple administrations, Bush was president when the warnings arrived and when the attacks occurred.',
                    sources: [
                        { url: 'https://govinfo.library.unt.edu/911/report/911Report.pdf', text: '9/11 Commission Final Report (Jul. 2004)' },
                        { url: 'https://www.archives.gov/declassification/iscap/pdf/2004-022-doc11.pdf', text: 'Presidential Daily Brief — Bin Ladin Determined To Strike in US (Aug. 6, 2001, declassified 2004)' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Fiscal Damage from Tax Cuts and War Spending',
                    shortLabel: 'Deficit & Tax Cuts',
                    description: 'Bush inherited a federal budget surplus and left office with a structural deficit, driven by two major tax cut packages in 2001 and 2003 combined with the costs of two wars and the Medicare prescription drug benefit — all largely unpaid for. The tax cuts disproportionately benefited higher earners and were not offset by spending reductions. Brookings Institution and the Congressional Budget Office documented the long-run revenue loss and deficit impact. The national debt roughly doubled during his presidency, from approximately $5.7 trillion to $10.6 trillion.',
                    sources: [
                        { url: 'https://www.brookings.edu/articles/the-fiscal-legacy-of-the-bush-tax-cuts/', text: 'Brookings Institution — The Fiscal Legacy of the Bush Tax Cuts' },
                        { url: 'https://www.cbo.gov/sites/default/files/110th-congress-2007-2008/reports/01-07-budgetoutlook.pdf', text: 'Congressional Budget Office — Budget and Economic Outlook (Jan. 2008)' }
                    ]
                },
                {
                    severity: 3,
                    title: 'No Child Left Behind Testing and Accountability Failures',
                    shortLabel: 'No Child Left Behind',
                    description: 'Bush\'s signature education law, No Child Left Behind, passed with broad bipartisan support in 2001 and aimed to improve accountability and close achievement gaps. In practice it became widely criticized for incentivizing states to lower academic standards to meet benchmarks, narrowing curricula toward tested subjects, and applying punitive labels to struggling schools without sufficient support. The backlash was significant enough that Congress replaced much of the law through the Every Student Succeeds Act in 2015, returning authority to states. The law\'s legacy is one of well-intentioned policy with damaging implementation consequences.',
                    sources: [
                        { url: 'https://www.edweek.org/policy-politics/no-child-left-behind-an-overview/2015/04', text: 'Education Week — No Child Left Behind: An Overview (Apr. 2015)' },
                        { url: 'https://www.brookings.edu/articles/ten-years-of-no-child-left-behind/', text: 'Brookings Institution — Ten Years of No Child Left Behind' }
                    ]
                }
            ]
        },
        clinton: {
            id: 'clinton',
            firstName: 'William J.',
            lastName: 'Clinton',
            ordinal: 42,
            party: 'democrat',
            bars: [
                {
                    severity: 8,
                    title: 'Failure to Intervene in the Rwandan Genocide',
                    shortLabel: 'Rwanda Genocide',
                    description: 'In 1994, an estimated 800,000 people — the vast majority of them Tutsi — were killed in Rwanda over roughly 100 days. The Clinton administration actively avoided using the word "genocide," a designation that would have triggered international legal obligations, and took no meaningful steps to intervene or to support a stronger U.N. response. Documents later obtained by the National Security Archive showed that administration officials were advised early that a genocide was underway. Clinton later traveled to Rwanda and publicly acknowledged that the U.S. and international community failed, calling it one of his greatest regrets.',
                    sources: [
                        { url: 'https://nsarchive.gwu.edu/briefing-book/africa/2004-03-24/rwandan-genocide-us-knew', text: 'National Security Archive — The Rwandan Genocide and the United States (Mar. 2004)' },
                        { url: 'https://www.hrw.org/reports/1999/rwanda/Geno15-8-01.htm', text: 'Human Rights Watch — Leave None to Tell the Story: Genocide in Rwanda (Mar. 1999)' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Perjury and Obstruction in the Lewinsky Scandal',
                    shortLabel: 'Perjury/Obstruction',
                    description: 'Clinton had a sexual relationship with White House intern Monica Lewinsky and denied it under oath during the Paula Jones civil deposition — a denial later contradicted by physical evidence. He was impeached by the House of Representatives in December 1998 on charges of perjury and obstruction of justice, making him only the second president in U.S. history to be impeached. The Senate acquitted him along largely partisan lines. Clinton subsequently accepted a five-year suspension of his Arkansas law license and paid a $25,000 fine as part of an agreement with the independent counsel.',
                    sources: [
                        { url: 'https://www.congress.gov/105/bills/hres611/BILLS-105hres611eh.pdf', text: 'House Articles of Impeachment Against President Clinton — 105th Congress (Dec. 1998)' },
                        { url: 'https://www.independent-counsel.gov/starr-report.htm', text: 'Office of the Independent Counsel — The Starr Report (Sep. 1998)' }
                    ]
                },
                {
                    severity: 6,
                    title: 'The 1994 Crime Bill and Mass Incarceration',
                    shortLabel: '1994 Crime Bill',
                    description: 'Clinton signed the Violent Crime Control and Law Enforcement Act of 1994, the largest federal crime bill in U.S. history. It provided funding for 100,000 new police officers and 100,000 new prison beds, established mandatory "three strikes" sentencing for federal offenses, expanded the federal death penalty to dozens of new offenses, and included financial incentives that pushed states toward harsher sentencing regimes. The ACLU, Brennan Center, and other criminal-justice researchers have documented the law\'s contribution to record U.S. incarceration rates, with its impacts falling disproportionately on Black communities. Clinton himself later said the law put "too many people in prison."',
                    sources: [
                        { url: 'https://www.brennancenter.org/our-work/analysis-opinion/revisiting-1994-crime-bill', text: 'Brennan Center for Justice — Revisiting the 1994 Crime Bill (Apr. 2019)' },
                        { url: 'https://www.aclu.org/report/tale-two-countries-racially-targeted-arrests-era-marijuana-reform', text: 'ACLU — Racial Disparities in U.S. Criminal Justice' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Signed the Defense of Marriage Act',
                    shortLabel: 'DOMA',
                    description: 'Clinton signed the Defense of Marriage Act in 1996, which defined marriage for all federal purposes as the union of one man and one woman and explicitly permitted states to refuse to recognize same-sex marriages performed in other states. The law denied federal recognition, benefits, and protections to same-sex couples for nearly two decades. The Supreme Court struck down the core federal definition provision in United States v. Windsor in 2013, with the majority opinion describing it as motivated by a desire to impose inequality. Clinton later said signing it was a mistake and called for its repeal.',
                    sources: [
                        { url: 'https://www.govinfo.gov/content/pkg/PLAW-104publ199/pdf/PLAW-104publ199.pdf', text: 'Defense of Marriage Act — Public Law 104-199 (Sep. 1996)' },
                        { url: 'https://supreme.justia.com/cases/federal/us/570/744/', text: 'United States v. Windsor — Supreme Court Opinion (Jun. 2013)' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Welfare Reform and the Weakening of the Safety Net',
                    shortLabel: 'Welfare Reform',
                    description: 'Clinton signed the Personal Responsibility and Work Opportunity Reconciliation Act of 1996, replacing the federal entitlement program Aid to Families with Dependent Children with the block-grant program Temporary Assistance for Needy Families. The law imposed strict work requirements, a five-year lifetime limit on federal assistance, and gave states broad discretion to reduce benefits. Supporters credited it with reducing welfare rolls; critics, including three administration officials who resigned in protest, argued it removed a critical safety net and left the poorest families more exposed during economic downturns. Research by the Urban Institute and others documented sharp increases in extreme poverty following the reform.',
                    sources: [
                        { url: 'https://www.urban.org/research/publication/welfare-reform-ten-years-later', text: 'Urban Institute — Welfare Reform Ten Years Later (Aug. 2006)' },
                        { url: 'https://www.cbpp.org/research/family-income-support/temporary-assistance-for-needy-families', text: 'Center on Budget and Policy Priorities — TANF at 25: Still Failing the Poorest Families' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Iraq Sanctions and Humanitarian Harm',
                    shortLabel: 'Iraq Sanctions',
                    description: 'The Clinton administration was the primary driver of maintaining comprehensive U.N. economic sanctions on Iraq throughout the 1990s. The exact mortality figures were disputed — some widely-cited numbers originated from Iraqi government sources — but contemporaneous U.S. State Department documents acknowledged a serious child-mortality crisis linked to degraded water treatment, medical supply shortages, and infrastructure deterioration. When Secretary of State Madeleine Albright was asked on 60 Minutes in 1996 whether the deaths of half a million Iraqi children were "worth it," she replied that it was "a very hard choice" but "we think the price is worth it." That exchange remains one of the most criticized moments of the era\'s foreign policy.',
                    sources: [
                        { url: 'https://nsarchive.gwu.edu/briefing-book/iraq/2020-02-25/us-iraq-sanctions-1990s-controversy-mortality-data', text: 'National Security Archive — U.S.-Iraq Sanctions and the Mortality Controversy (Feb. 2020)' },
                        { url: 'https://www.unicef.org/newsline/99pr29.htm', text: 'UNICEF — Child and Maternal Mortality Survey in Iraq (Aug. 1999)' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Bombing the Al-Shifa Pharmaceutical Factory in Sudan',
                    shortLabel: 'Al-Shifa Strike',
                    description: 'Following the 1998 U.S. embassy bombings in Kenya and Tanzania, Clinton ordered cruise missile strikes against targets in Afghanistan and Sudan. The Sudan target, the Al-Shifa pharmaceutical plant in Khartoum, was publicly described by the administration as linked to al-Qaeda and to chemical weapons production. Those justifications were subsequently challenged by American and international investigators who found no credible evidence of either link. The plant had been one of Sudan\'s primary sources of medicines for humans and animals; its destruction had real humanitarian consequences. No administration official was held accountable for the intelligence failure.',
                    sources: [
                        { url: 'https://www.theguardian.com/world/1999/oct/17/theobserver', text: 'The Observer — The Bombing of Al-Shifa: How the Evidence Failed (Oct. 1999)' },
                        { url: 'https://nsarchive.gwu.edu/briefing-book/sudan/2016-08-22/al-shifa-pharmaceutical-plant-bombing-1998', text: 'National Security Archive — Al-Shifa Pharmaceutical Plant Bombing (Aug. 2016)' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Financial Deregulation via Gramm-Leach-Bliley',
                    shortLabel: 'Financial Deregulation',
                    description: 'Clinton signed the Gramm-Leach-Bliley Act in 1999, repealing core provisions of the Glass-Steagall Act that had separated commercial banking from investment banking since the New Deal. The law enabled the formation of massive financial conglomerates combining banking, securities, and insurance activities. Whether Gramm-Leach-Bliley directly caused the 2008 financial crisis is genuinely debated among economists, but there is broad agreement that it contributed to the deregulatory environment and the growth of financial institutions considered "too big to fail" — several of which required enormous government bailouts in 2008.',
                    sources: [
                        { url: 'https://www.fdic.gov/regulations/applications/srletters/1999/sr9928a1.pdf', text: 'FDIC — Overview of the Gramm-Leach-Bliley Act (1999)' },
                        { url: 'https://www.brookings.edu/articles/did-gramm-leach-bliley-contribute-to-the-financial-crisis/', text: 'Brookings Institution — Did Gramm-Leach-Bliley Contribute to the Financial Crisis?' }
                    ]
                },
                {
                    severity: 4,
                    title: 'NAFTA and U.S. Manufacturing Job Losses',
                    shortLabel: 'NAFTA',
                    description: 'Clinton championed the North American Free Trade Agreement and signed its implementing legislation in 1993. Supporters argue the agreement lowered consumer prices, deepened supply-chain integration, and grew total trade. Critics argue it accelerated manufacturing outsourcing and devastated communities dependent on industries such as textiles, auto parts, and electronics. The Economic Policy Institute estimated that NAFTA-related trade deficits displaced roughly 700,000 U.S. jobs by 2010. The real harm was geographically concentrated, falling hardest on working-class communities in the Midwest and South that had few alternative economic options.',
                    sources: [
                        { url: 'https://www.epi.org/publication/nafta-at-20/', text: 'Economic Policy Institute — NAFTA at 20: One Million U.S. Jobs Lost, Higher Income Inequality (Oct. 2013)' },
                        { url: 'https://crsreports.congress.gov/product/pdf/R/R42965', text: 'Congressional Research Service — NAFTA at 20: Accomplishments and Challenges (Feb. 2014)' }
                    ]
                },
                {
                    severity: 4,
                    title: '"Don\'t Ask, Don\'t Tell" Military Policy',
                    shortLabel: 'Don\'t Ask Don\'t Tell',
                    description: 'Clinton campaigned in 1992 on allowing gay and lesbian people to serve openly in the military. After taking office he faced fierce military and congressional resistance. The resulting compromise, "Don\'t Ask, Don\'t Tell," prohibited the military from asking about sexual orientation but still required gay, lesbian, and bisexual service members to conceal their identity or face discharge. Over the 17 years before its repeal in 2010, more than 14,000 service members were discharged under the policy. It is now broadly recognized as discriminatory. Clinton later said he signed it because he believed it was the best achievable outcome at the time, but acknowledged its harmful consequences.',
                    sources: [
                        { url: 'https://www.gao.gov/assets/gao-05-299.pdf', text: 'GAO — Military Personnel: Financial Costs and Loss of Critical Skills Due to DOD\'s Homosexual Conduct Policy (Feb. 2005)' },
                        { url: 'https://www.congress.gov/111/plaws/publ321/PLAW-111publ321.pdf', text: 'Don\'t Ask, Don\'t Tell Repeal Act of 2010 — Public Law 111-321' }
                    ]
                }
            ]
        },
        reagan: {
            id: 'reagan',
            firstName: 'Ronald W.',
            lastName: 'Reagan',
            ordinal: [40, 47],
            party: 'republican',
            bars: [
                {
                    severity: 9,
                    title: 'Iran-Contra: Secret Arms Sales and Illegal Contra Funding',
                    shortLabel: 'Iran-Contra',
                    description: 'Reagan\'s administration secretly sold arms to Iran — in violation of a U.S. arms embargo and the administration\'s own public policy against negotiating with terrorism-sponsoring states — and then illegally diverted the proceeds to fund Contra rebels in Nicaragua in defiance of explicit congressional restrictions. The independent counsel\'s final report concluded that Reagan chose to proceed "in the utmost secrecy" and personally disregarded the administration\'s stated policies. Reagan eventually acknowledged on national television that the operation had "deteriorated" into trading arms for hostages. Eleven administration officials were convicted; several were later pardoned by President George H.W. Bush.',
                    sources: [
                        { url: 'https://fas.org/irp/offdocs/walsh/execsum.htm', text: 'Independent Counsel Lawrence Walsh — Iran-Contra Final Report Executive Summary (Aug. 1993)' },
                        { url: 'https://www.brown.edu/Research/Understanding_the_Iran_Contra_Affair/documents.php', text: 'Brown University — Iran-Contra Affair Declassified Document Archive' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Backing the Contras and Fueling Nicaragua\'s Civil War',
                    shortLabel: 'Contra Support',
                    description: 'Separate from the Iran-Contra cover-up, the underlying policy of supporting anti-Sandinista Contra rebels in Nicaragua caused serious harm. Reagan signed a secret directive in 1981 authorizing $19 million in CIA paramilitary operations in Nicaragua. The Contras were repeatedly documented by human rights organizations as committing atrocities including murder, rape, and torture of civilians. The International Court of Justice ruled in 1986 that U.S. support for the Contras violated international law and ordered the U.S. to pay reparations — a ruling Washington rejected. Congress cut off funding through the Boland Amendment precisely because of these concerns.',
                    sources: [
                        { url: 'https://www.icj-cij.org/case/70', text: 'International Court of Justice — Nicaragua v. United States (Jun. 1986)' },
                        { url: 'https://www.hrw.org/reports/1989/nicaragua.pdf', text: 'Human Rights Watch — Human Rights Abuses by the Contras in Nicaragua (1989)' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Slow Response to the AIDS Crisis',
                    shortLabel: 'AIDS Crisis',
                    description: 'As AIDS killed tens of thousands of Americans — disproportionately gay men, intravenous drug users, and people of color — the Reagan administration was largely silent. Reagan did not publicly mention AIDS until 1985, four years into the epidemic, and did not deliver a major speech on the disease until 1987, by which point more than 20,000 Americans had died. Internal documents showed aides treated the epidemic as a political liability rather than a public health emergency. The CDC\'s own historians and public health researchers have documented how the delayed federal response allowed the epidemic to spread far more broadly than it otherwise would have.',
                    sources: [
                        { url: 'https://www.cdc.gov/mmwr/preview/mmwrhtml/00001163.htm', text: 'CDC MMWR — Pneumocystis Pneumonia, First AIDS Report (Jun. 1981)' },
                        { url: 'https://www.ucsf.edu/news/2011/11/10918/reagan-aids-crisis-and-real-story-about-white-house-and-epidemic', text: 'UCSF — Reagan, AIDS, and the Real Story About the White House and the Epidemic (Nov. 2011)' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Escalating the Drug War and Creating Crack/Cocaine Sentencing Disparity',
                    shortLabel: 'Drug War & Sentencing',
                    description: 'Reagan dramatically expanded the federal drug war, prioritizing criminal punishment over treatment. The Anti-Drug Abuse Act of 1986 established mandatory minimum sentences for drug offenses and created a 100-to-1 sentencing disparity between crack cocaine and powder cocaine — meaning someone caught with five grams of crack received the same mandatory minimum as someone with 500 grams of powder. Because crack was more prevalent in Black communities, the disparity drove racially skewed incarceration rates that the U.S. Sentencing Commission later described as unjustified. The disparity remained law for 24 years until partially reformed by the Fair Sentencing Act of 2010.',
                    sources: [
                        { url: 'https://www.ussc.gov/sites/default/files/pdf/news/congressional-testimony-and-reports/drug-topics/199504_RtC_Cocaine_Sentencing_Policy.pdf', text: 'U.S. Sentencing Commission — Cocaine and Federal Sentencing Policy (Feb. 1995)' },
                        { url: 'https://www.brennancenter.org/our-work/analysis-opinion/how-war-drugs-affected-incarceration-rates', text: 'Brennan Center for Justice — How the War on Drugs Affected Incarceration Rates' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Vetoed Sanctions Against Apartheid South Africa',
                    shortLabel: 'Apartheid Veto',
                    description: 'Reagan vetoed the Comprehensive Anti-Apartheid Act of 1986, which would have imposed economic sanctions on South Africa\'s white minority government and called for the release of Nelson Mandela. Reagan argued that his policy of "constructive engagement" — maintaining economic and diplomatic ties — would be more effective at encouraging change. Congress disagreed so strongly that it overrode his veto with bipartisan support, one of only eight successful veto overrides of his presidency. The episode is widely regarded as one of Reagan\'s most significant moral failures, placing the U.S. in effective opposition to the international consensus against apartheid.',
                    sources: [
                        { url: 'https://www.congress.gov/bill/99th-congress/house-bill/4868', text: 'Comprehensive Anti-Apartheid Act of 1986 — Congressional Record, 99th Congress' },
                        { url: 'https://www.reaganlibrary.gov/archives/speech/message-house-representatives-returning-without-approval-legislation-imposing', text: 'Reagan Presidential Library — Veto Message on Anti-Apartheid Legislation (Sep. 1986)' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Firing 11,000 Striking Air Traffic Controllers',
                    shortLabel: 'PATCO Strike',
                    description: 'In August 1981, when members of the Professional Air Traffic Controllers Organization went on strike demanding higher pay and shorter hours, Reagan ordered them back to work within 48 hours, citing a federal law prohibiting strikes by government employees. When roughly 11,345 controllers refused, he fired them and banned them from federal employment for life. The FAA trained replacement controllers and the aviation system continued functioning. Defenders argue Reagan was enforcing the law; critics argue the mass firing sent a signal to private employers that aggressive union-busting was acceptable, and labor economists widely cite it as a turning point that accelerated the decline of U.S. union membership and bargaining power.',
                    sources: [
                        { url: 'https://www.bls.gov/opub/mlr/2006/01/art3full.pdf', text: 'Bureau of Labor Statistics — The PATCO Strike: A Retrospective (Jan. 2006)' },
                        { url: 'https://www.epi.org/publication/reagan-fired-patco-workers/', text: 'Economic Policy Institute — Reagan\'s Firing of the PATCO Workers (Aug. 2011)' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Savings and Loan Deregulation and the S&L Crisis',
                    shortLabel: 'S&L Crisis',
                    description: 'Reagan signed the Garn-St. Germain Depository Institutions Act in 1982, which dramatically expanded the investment powers of savings and loan institutions while loosening federal oversight, allowing them to offer adjustable-rate mortgages and invest in riskier assets. In combination with earlier deregulation and inadequate federal supervision, these changes contributed to widespread fraud and reckless lending across the S&L industry. By the time the crisis peaked in the late 1980s and early 1990s, roughly 1,000 institutions had failed. The federal bailout ultimately cost taxpayers an estimated $124 billion, with total losses to the economy considerably higher.',
                    sources: [
                        { url: 'https://www.fdic.gov/bank/historical/history/167_188.pdf', text: 'FDIC — History of the Eighties: The Savings and Loan Crisis (1997)' },
                        { url: 'https://www.gao.gov/assets/160/151363.pdf', text: 'GAO — Thrift Failures: Costly Failures Resulted from Regulatory Violations and Unsafe Practices (Jun. 1989)' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Housing and Social Program Cuts Amid Rising Homelessness',
                    shortLabel: 'Housing & Social Cuts',
                    description: 'Homelessness became a visible national crisis during the 1980s, driven by multiple factors including deinstitutionalization, rising rents, and economic disruption. Reagan\'s administration cut low-income housing subsidies sharply — the HUD budget fell by roughly 75% in real terms between 1980 and 1989 — and reduced funding for food assistance, Medicaid, and other safety-net programs. The Urban Institute documented how Reagan-era budget cuts reduced the availability of federally assisted housing. While Reagan did not cause homelessness singlehandedly, housing advocates and researchers consistently identify the program cuts as a major contributor to its dramatic expansion during this period.',
                    sources: [
                        { url: 'https://www.urban.org/research/publication/reagan-administration-and-low-income-housing', text: 'Urban Institute — The Reagan Administration and Low-Income Housing (1982)' },
                        { url: 'https://www.cbpp.org/research/reagan-era-cuts-in-housing-programs', text: 'Center on Budget and Policy Priorities — Reagan-Era Cuts in Housing Programs' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Dismantling Federal Mental Health Policy',
                    shortLabel: 'Mental Health Cuts',
                    description: 'Reagan signed the Omnibus Budget Reconciliation Act of 1981, which effectively repealed the Mental Health Systems Act passed under Carter and converted federal mental health funding into block grants to states, with significantly reduced total funding. While deinstitutionalization of psychiatric patients had begun decades earlier, the Reagan shift eliminated the promised federal community-care infrastructure meant to replace institutionalization. A Milbank Quarterly analysis described Reagan\'s inauguration as prompting an "immediate reversal" of federal mental health policy. Critics argue the resulting gap in care contributed to the cycles of homelessness, incarceration, and untreated illness that persist today.',
                    sources: [
                        { url: 'https://www.milbank.org/quarterly/articles/the-political-context-for-the-reagan-administration-mental-health-policy/', text: 'Milbank Quarterly — The Political Context for Reagan Administration Mental Health Policy' },
                        { url: 'https://www.treatmentadvocacycenter.org/the-consequences-of-ignoring-mental-illness', text: 'Treatment Advocacy Center — The Consequences of Ignoring Mental Illness' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Tax Cuts That Increased Deficits and Favored Higher Earners',
                    shortLabel: 'Reagan Tax Cuts',
                    description: 'Reagan\'s Economic Recovery Tax Act of 1981 reduced the top marginal income tax rate from 70% to 50%, with further cuts later in his presidency bringing it to 28%. Proponents argued the cuts would stimulate growth sufficient to offset lost revenue — a theory known as supply-side or "trickle-down" economics. In practice, federal deficits increased substantially during Reagan\'s presidency, and the national debt tripled from roughly $994 billion to $2.9 trillion. Brookings Institution has stated plainly that the Reagan tax cut "didn\'t pay for itself." Independent analyses found the benefits of the cuts accrued disproportionately to higher-income households.',
                    sources: [
                        { url: 'https://www.brookings.edu/articles/the-reagan-tax-cuts-lessons-for-tax-reform/', text: 'Brookings Institution — The Reagan Tax Cuts: Lessons for Tax Reform' },
                        { url: 'https://www.cbpp.org/research/federal-tax/the-legacy-of-the-reagan-tax-cuts', text: 'Center on Budget and Policy Priorities — The Legacy of the Reagan Tax Cuts' }
                    ]
                }
            ]
        },
        jackson: {
            id: 'jackson',
            firstName: 'Andrew',
            lastName: 'Jackson',
            ordinal: 7,
            party: 'democrat',
            bars: [
                {
                    severity: 10,
                    title: 'Signed the Indian Removal Act',
                    shortLabel: 'Indian Removal Act',
                    description: 'On May 28, 1830, Jackson signed the Indian Removal Act into law, authorizing the federal government to forcibly relocate Native nations living east of the Mississippi River to lands farther west. The National Archives describes it as the first major legislative step in forcing American Indians westward, driven by white settler demand for Native land. The law set in motion the systematic dispossession of dozens of tribes — including the Cherokee, Choctaw, Creek, Chickasaw, and Seminole — from territories they had inhabited for generations, through a combination of coercion, fraudulent treaties, and military force.',
                    sources: [
                        { url: 'https://www.archives.gov/education/lessons/indian-removal-act', text: 'National Archives — Indian Removal Act: Primary Documents in American History (1830)' },
                        { url: 'https://history.state.gov/milestones/1830-1860/indian-treaties', text: 'U.S. State Department Office of the Historian — Indian Treaties and the Removal Act' }
                    ]
                },
                {
                    severity: 10,
                    title: 'Trail of Tears and Mass Death of Native People',
                    shortLabel: 'Trail of Tears',
                    description: 'The most catastrophic consequence of Jackson\'s removal policy was the forced march now known as the Trail of Tears. In 1838, thousands of federal soldiers and Georgia volunteers forcibly relocated the Cherokee Nation, with some Cherokees hunted, imprisoned, assaulted, or killed in the process. Survivors were forced on a roughly 1,000-mile march with inadequate food, shelter, or medical care. Approximately 4,000 Cherokee died — roughly one in four — along the route. Similar forced removals devastated the Choctaw, Creek, Chickasaw, and Seminole nations. Although the 1838 march occurred after Jackson left office, his policy, his treaties, and his deliberate refusal to protect tribal sovereignty directly created the conditions that made it inevitable.',
                    sources: [
                        { url: 'https://www.loc.gov/collections/trail-of-tears/about-this-collection/', text: 'Library of Congress — Trail of Tears: About This Collection' },
                        { url: 'https://www.nps.gov/trte/learn/historyculture/facts.htm', text: 'National Park Service — Trail of Tears: Facts' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Pressuring, Bribing, and Threatening Tribes into Removal Treaties',
                    shortLabel: 'Coerced Removal Treaties',
                    description: 'Jackson\'s removal policy was not a voluntary land exchange. The State Department\'s Office of the Historian documents that once the Indian Removal Act was law, Jackson and his allies were free to "persuade, bribe, and threaten" Native nations into signing removal treaties. Federal agents exploited internal tribal divisions, recognized fraudulent splinter factions as official negotiating parties, and pressured leaders under duress. The Treaty of New Echota — the legal instrument used to justify Cherokee removal — was signed by a small unauthorized faction and was repudiated by the vast majority of the Cherokee Nation and its elected government, yet the administration treated it as binding.',
                    sources: [
                        { url: 'https://history.state.gov/milestones/1830-1860/indian-treaties', text: 'U.S. State Department Office of the Historian — Indian Treaties and the Removal Act' },
                        { url: 'https://www.archives.gov/files/education/lessons/georgia-cherokee/images/white-plains-treaty-1837.pdf', text: 'National Archives — Treaty of New Echota and Cherokee Removal Documents' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Refused to Enforce Worcester v. Georgia',
                    shortLabel: 'Defied Supreme Court',
                    description: 'In Worcester v. Georgia (1832), the Supreme Court under Chief Justice John Marshall ruled that Georgia\'s laws had no force within Cherokee territory, affirming tribal sovereignty and striking down state efforts to seize Native lands. Jackson refused to enforce the decision. The Federal Judicial Center confirms he "took no action to force Georgia\'s compliance," allowing the state to continue its seizure of Cherokee territory and its campaign of harassment against tribal members. The defiance of a Supreme Court ruling in order to enable the dispossession of Native peoples represents one of the most flagrant abuses of executive power in American presidential history.',
                    sources: [
                        { url: 'https://www.fjc.gov/history/cases/landmark-judicial-decisions/worcester-v-georgia', text: 'Federal Judicial Center — Worcester v. Georgia: Landmark Case History' },
                        { url: 'https://supreme.justia.com/cases/federal/us/31/515/', text: 'Worcester v. Georgia — Supreme Court Opinion, 31 U.S. 515 (1832)' }
                    ]
                },
                {
                    severity: 10,
                    title: 'Enslaved More Than 150 People and Profited from Their Labor',
                    shortLabel: 'Slavery',
                    description: 'Jackson was a major enslaver throughout his life and presidency. The Hermitage — Jackson\'s plantation — records that he owned approximately 150 enslaved people at the time of his death, and researchers have identified more than 500 individuals enslaved at The Hermitage or descended from those held there. In 1829, just before entering the White House, Jackson ordered an inventory listing 95 enslaved people at The Hermitage; he brought enslaved workers with him to serve in the executive mansion. His wealth, his political career, and his plantation were all built on the forced, uncompensated labor of enslaved Black people.',
                    sources: [
                        { url: 'https://thehermitage.com/learn/andrew-jackson/people-of-the-hermitage/enslaved-community/', text: 'The Hermitage — The Enslaved Community at The Hermitage' },
                        { url: 'https://www.whitehousehistory.org/slavery-in-the-white-house-andrew-jackson', text: 'White House Historical Association — Slavery in the White House: Andrew Jackson' }
                    ]
                },
                {
                    severity: 10,
                    title: 'Advertised Brutal Punishment of Escaped Enslaved Person',
                    shortLabel: 'Runaway Slave Ad',
                    description: 'In 1804, Jackson placed a newspaper advertisement seeking the capture of an enslaved man who had escaped, offering a reward for his return and an additional payment for each hundred lashes inflicted on him — up to three hundred lashes total. The advertisement, documented by the University of Glasgow\'s Runaway Slaves in Britain project and discussed in the Tennessee Historical Quarterly, reveals not merely passive participation in the institution of slavery but active, explicit cruelty. The offer of financial incentive for brutal corporal punishment reflects both Jackson\'s personal character and the systemic violence on which slavery depended.',
                    sources: [
                        { url: 'https://www.runaways.gla.ac.uk/database/', text: 'University of Glasgow — Runaway Slaves in Britain: Advertisement Database' },
                        { url: 'https://www.tnhistoricalsociety.org/tennessee-historical-quarterly/', text: 'Tennessee Historical Quarterly — Documentation of Jackson Runaway Slave Advertisement' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Bank War and Destabilization of the Financial System',
                    shortLabel: 'Bank War',
                    description: 'Jackson waged a sustained campaign against the Second Bank of the United States, vetoing its recharter in 1832 and then removing federal deposits from it and distributing them among state-chartered "pet banks." The Bank\'s president Nicholas Biddle responded by contracting credit sharply, contributing to a financial downturn. While the Bank had legitimate critics — it did concentrate financial power and had engaged in political lending — Jackson\'s abrupt and destabilizing approach to dismantling it helped create the conditions for the broader financial crisis that followed. Most economic historians treat Jackson\'s handling of the Bank as reckless regardless of whether the institution deserved to survive.',
                    sources: [
                        { url: 'https://www.britannica.com/topic/Bank-War', text: 'Britannica — Bank War: Jackson and the Second Bank of the United States' },
                        { url: 'https://www.federalreservehistory.org/essays/bank-war', text: 'Federal Reserve History — The Bank War' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Specie Circular and the Panic of 1837',
                    shortLabel: 'Panic of 1837',
                    description: 'In 1836, Jackson issued the Specie Circular, an executive order requiring that payments for federal public lands be made exclusively in gold or silver rather than bank-issued paper currency. The order was intended to curtail land speculation, but it had the effect of draining specie from eastern banks, tightening credit, and puncturing an already overinflated land bubble. When the bubble burst in 1837, banks across the country failed, businesses collapsed, and a severe economic depression followed. The Panic of 1837 had multiple causes — including British credit contraction and falling cotton prices — but Jackson\'s hard-money policy was a major and widely recognized contributing factor.',
                    sources: [
                        { url: 'https://dp.la/primary-source-sets/the-panic-of-1837', text: 'Digital Public Library of America — The Panic of 1837: Primary Source Set' },
                        { url: 'https://www.britannica.com/event/Panic-of-1837', text: 'Britannica — Panic of 1837' }
                    ]
                },
                {
                    severity: 3,
                    title: 'Entrenching the Spoils System in Federal Government',
                    shortLabel: 'Spoils System',
                    description: 'Jackson aggressively expanded the practice of awarding federal government positions to political supporters and loyalists rather than on the basis of competence or merit — a practice that became known as the "spoils system." He replaced a significant portion of the existing federal workforce with his own allies, arguing this democratized government by breaking up entrenched elites. Critics at the time and since have argued it replaced one form of favoritism with another, prioritized loyalty over ability, and created incentives for corruption and patronage politics that plagued American government for decades until civil service reform began with the Pendleton Act of 1883.',
                    sources: [
                        { url: 'https://www.britannica.com/topic/spoils-system', text: 'Britannica — Spoils System: Origins and Jackson\'s Role' },
                        { url: 'https://www.opm.gov/policy-data-oversight/data-analysis-documentation/federal-employment-reports/historical-tables/total-government-employment-since-1962/', text: 'Office of Personnel Management — History of Federal Civil Service Reform' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Nullification Crisis and Threat of Military Force Against a State',
                    shortLabel: 'Nullification Crisis',
                    description: 'When South Carolina declared federal tariff laws null and void within its borders in 1832 — threatening to secede if the federal government attempted to collect them — Jackson responded by declaring nullification treasonous and asking Congress for authority to use military force to compel compliance. Congress passed the Force Bill, authorizing armed federal enforcement of tariff collection. While Jackson was constitutionally correct that states cannot unilaterally nullify federal law, the confrontation brought the country to the brink of armed conflict between federal troops and a state. A last-minute compromise tariff defused the crisis, but it previewed the sectional tensions that would eventually lead to the Civil War.',
                    sources: [
                        { url: 'https://www.britannica.com/event/Nullification-Crisis', text: 'Britannica — Nullification Crisis (1832–1833)' },
                        { url: 'https://millercenter.org/president/jackson/the-nullification-crisis', text: 'Miller Center — Andrew Jackson: The Nullification Crisis' }
                    ]
                }
            ]
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
            escapeHtml(bar.shortLabel) +
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

    /* --------------------------------------------------------------------------
       Per-label tight-fit — desktop fallback for outer labels that would
       clip past the viewport edge at their natural single-line size.

       Bar widths are fixed (20%–80% of the half-viewport). For most labels
       in the dataset that leaves enough outer gutter at common desktop
       widths. When a particular label still doesn't fit — long words,
       narrow viewports, or both — this function tags it with .label-tight
       and sets its max-width to the available outer space, which lets it
       wrap to two lines at a smaller font size. Two wrapped lines at
       0.85rem / 1.1 line-height stay comfortably within the 62px bar
       height, so the row's overall height doesn't change.

       Only one label is shrunk per offender; non-overflowing labels keep
       their default styling. We don't shrink the bars themselves —
       silhouette stability across selections is the whole point of the
       fixed-width strategy.
       -------------------------------------------------------------------------- */
    function applyLabelTightFit() {
        const labels = document.querySelectorAll('.bar-label-outer');
        if (!labels.length) return;

        // Mobile uses inner labels, so any leftover .label-tight from a
        // desktop session needs to be cleared (and it'd be a no-op
        // anyway since outer labels are hidden).
        const onMobile = mql.matches;

        const SAFETY = 8;       // breathing room past the viewport edge
        const GAP = 18;         // mirrors .bar-row { gap: 18px }
        const BREATHING = 6;    // shave a few px off max-width so wrapped
        // text doesn't kiss the edge
        const vw = window.innerWidth;

        labels.forEach(function (label) {
            // Always reset before re-measuring; the previous render or
            // a wider viewport may have applied .label-tight that no
            // longer applies.
            label.classList.remove('label-tight');
            label.style.maxWidth = '';

            if (onMobile) return;

            const bar = label.closest('.bar');
            if (!bar) return;
            const fill = bar.querySelector('.bar-fill');
            if (!fill) return;

            const labelRect = label.getBoundingClientRect();
            const fillRect = fill.getBoundingClientRect();
            const side = bar.dataset.side;

            let overflow = false;
            let availableOuter = 0;

            if (side === 'left') {
                // Label sits to the LEFT of the bar; risk is running
                // off the left viewport edge.
                overflow = labelRect.left < SAFETY;
                availableOuter = fillRect.left - GAP - SAFETY - BREATHING;
            } else {
                // Label sits to the RIGHT of the bar; risk is the
                // right viewport edge.
                overflow = labelRect.right > vw - SAFETY;
                availableOuter = vw - fillRect.right - GAP - SAFETY - BREATHING;
            }

            if (!overflow) return;
            if (availableOuter < 40) availableOuter = 40; // hard floor;
            // anything narrower would be unreadable even wrapped, but
            // line-clamp + ellipsis still saves us from breaking layout.

            label.classList.add('label-tight');
            label.style.maxWidth = availableOuter.toFixed(1) + 'px';
        });
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
       Name badge — populate the spans inside .picker-cell > .picker-badge
       from the currently-selected president's data.

       The badge text lives in the picker cell (which straddles the
       header/comparison boundary), not inside .side-left/.side-right.
       We still touch the .side- element to update its aria-label
       (section landmark) and data-party (background + bar theming).
       -------------------------------------------------------------------------- */
    function renderNameBadge(side) {
        const cell = document.querySelector('.picker-cell[data-side="' + side + '"]');
        if (!cell) return;
        const sideEl = document.querySelector('.side-' + side);

        const nf = cell.querySelector('.name-first');
        const ln = cell.querySelector('.last-name');
        const nd = cell.querySelector('.name-detail');

        const president = presidents[selection[side]];
        if (!president) {
            // Mirror the renderSide defensive path — clear rather than crash.
            if (nf) nf.textContent = '';
            if (ln) ln.textContent = '';
            if (nd) nd.textContent = '';
            if (sideEl) sideEl.setAttribute('aria-label', side === 'left' ? 'Left president' : 'Right president');
            return;
        }

        // textContent for plain strings (auto-escapes anything weird).
        if (nf) nf.textContent = president.firstName;
        if (ln) ln.textContent = president.lastName;
        // innerHTML for the ordinal because formatOrdinal returns markup
        // (sup tags). Safe because the input is author-controlled data.
        if (nd) nd.innerHTML = formatOrdinal(president.ordinal);

        // Repaint the picker badge border. --party-rgb is inherited from
        // the nearest data-party ancestor, and the badge's border reads it.
        // Without this, switching across parties leaves a stale outline.
        cell.dataset.party = president.party;

        if (sideEl) {
            // Re-announce the section landmark with the new president's name.
            sideEl.setAttribute('aria-label', president.firstName + ' ' + president.lastName);
            // Drive the side's color theme. The CSS [data-party="..."] block
            // defines --party-* variables; the side's background gradient,
            // radial accent, bar fills, and detail accent border all read
            // those vars, so a single attribute swap repaints the side.
            sideEl.dataset.party = president.party;
        }
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
        // .picker-badge base rule reads rgba(var(--party-rgb), 0.45),
        // so changing data-party on the cell recolors the border.
        // Must target .picker-cell, not select.parentElement (the badge),
        // because renderNameBadge writes to the cell — and whichever
        // ancestor sits closer wins the CSS variable lookup.
        const cell = select.closest('.picker-cell');
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
        // Re-evaluate per-label fit — the new president's labels may
        // have different widths than the previous one's.
        applyLabelTightFit();
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

    // Mobile-query setup hoisted above the initial render so
    // applyLabelTightFit can read mql.matches on its very first call.
    const MOBILE_QUERY = '(max-width: 1000px)';
    const mql = window.matchMedia(MOBILE_QUERY);
    const isMobile = () => mql.matches;

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
    // First label-fit pass — bars are in the DOM, so getBoundingClientRect
    // can read their natural widths.
    applyLabelTightFit();

    /* --------------------------------------------------------------------------
       Everything below is the original interaction code, unchanged.
       -------------------------------------------------------------------------- */

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
        // Crossing the breakpoint flips outer/inner labels — clear or
        // re-apply tight-fit accordingly.
        applyLabelTightFit();
    });

    /* --------------------------------------------------------------------------
       Viewport resize — bar widths track viewport (they're %-based), so
       a label that fit at 1600px may clip at 1100px. rAF-debounced so
       drag-resize coalesces to one recompute per frame.
       -------------------------------------------------------------------------- */
    let resizeRaf = 0;
    window.addEventListener('resize', () => {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
            resizeRaf = 0;
            applyLabelTightFit();
        });
    });
})();