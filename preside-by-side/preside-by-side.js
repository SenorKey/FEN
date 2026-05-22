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
            portrait: '/assets/images/trump.webp',
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
            portrait: '/assets/images/biden.webp',
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
        obama: {
            id: 'obama',
            firstName: 'Barack H.',
            lastName: 'Obama',
            ordinal: 44,
            party: 'democrat',
            portrait: '/assets/images/obama.webp',
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
            portrait: '/assets/images/gwb.webp',
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
            portrait: '/assets/images/clinton.webp',
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
            ordinal: [40],
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
        },
        johnson: {
            id: 'johnson',
            firstName: 'Andrew',
            lastName: 'Johnson',
            ordinal: 17,
            party: 'democrat',
            portrait: '/assets/images/johnson.webp',
            bars: [
                {
                    severity: 10,
                    title: 'Undermined Reconstruction and Restored Confederate Power',
                    shortLabel: 'Sabotaged Reconstruction',
                    description: 'Johnson\'s approach to Reconstruction was the defining catastrophe of his presidency. Rather than using federal authority to protect the rights of four million formerly enslaved people and restructure the postwar South, he moved rapidly to restore Southern states with minimal conditions, allowing former Confederate leaders to reestablish political control almost immediately. The National Park Service documents how Johnson\'s lenient plan let Southern states set up new governments that quickly passed Black Codes restricting Black freedom and reasserted white supremacy. His systematic resistance to congressional Reconstruction — including multiple vetoes and open political warfare against Radical Republicans — helped doom what was one of the most important democratic opportunities in American history.',
                    sources: [
                        { url: 'https://www.nps.gov/subjects/reconstruction/andrew-johnson.htm', text: 'National Park Service — Andrew Johnson and Reconstruction' },
                        { url: 'https://www.loc.gov/exhibits/creating-the-united-states/reconstruction.html', text: 'Library of Congress — Reconstruction: Creating the United States' }
                    ]
                },
                {
                    severity: 10,
                    title: 'Vetoed the Civil Rights Act of 1866',
                    shortLabel: 'Civil Rights Veto',
                    description: 'Johnson vetoed the Civil Rights Act of 1866, which defined U.S. citizenship and guaranteed basic civil rights to formerly enslaved people — the first major federal civil-rights legislation in American history. In his veto message, Johnson argued the bill discriminated "in favor of the Negro," revealing the openly racial character of his opposition. Congress overrode his veto, the first time in U.S. history a major piece of legislation was enacted over a presidential veto. The Act\'s core provisions were later incorporated into the Fourteenth Amendment precisely because Congress feared a future president or court might otherwise undo them.',
                    sources: [
                        { url: 'https://www.archives.gov/milestone-documents/civil-rights-act-of-1866', text: 'National Archives — Civil Rights Act of 1866: Milestone Documents' },
                        { url: 'https://history.house.gov/Historical-Highlights/1800-1850/The-Civil-Rights-Bill-of-1866/', text: 'U.S. House of Representatives — Historical Highlights: The Civil Rights Bill of 1866' }
                    ]
                },
                {
                    severity: 10,
                    title: 'Vetoed the Freedmen\'s Bureau Expansion',
                    shortLabel: 'Freedmen\'s Bureau Veto',
                    description: 'The Freedmen\'s Bureau was the primary federal agency responsible for helping formerly enslaved people navigate the transition from bondage to freedom, providing labor contracts, legal protection, education, and emergency relief. Johnson vetoed legislation to extend and strengthen it, arguing it was an unconstitutional federal intrusion into state affairs. His veto came at the most vulnerable moment in freedpeople\'s lives — immediately after emancipation, with no land, resources, or legal standing — and exposed them to exploitation by the same planter class that had enslaved them. Congress eventually overrode him, but Johnson\'s resistance significantly hampered the Bureau\'s effectiveness and reach.',
                    sources: [
                        { url: 'https://www.nps.gov/subjects/reconstruction/freedmens-bureau.htm', text: 'National Park Service — The Freedmen\'s Bureau' },
                        { url: 'https://www.archives.gov/research/african-americans/freedmens-bureau', text: 'National Archives — Records of the Bureau of Refugees, Freedmen, and Abandoned Lands' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Issued More Than 13,000 Pardons to Former Confederates',
                    shortLabel: 'Confederate Pardons',
                    description: 'Johnson issued pardons to more than 13,000 former Confederates, restoring their political and property rights and allowing ex-rebel leaders to return to power with remarkable speed. His Christmas 1868 proclamation extended sweeping amnesty to top Confederate officials, including Jefferson Davis. Rather than treating rebellion against the United States as a disqualifying act for political leadership, Johnson\'s pardon policy helped restore the antebellum planter class to dominance across the South. The result was that the men who had launched the deadliest war in American history against the federal government were back in state legislatures, governor\'s offices, and eventually Congress within years of their defeat.',
                    sources: [
                        { url: 'https://www.nps.gov/subjects/reconstruction/andrew-johnson.htm', text: 'National Park Service — Andrew Johnson and Reconstruction' },
                        { url: 'https://millercenter.org/president/johnson/key-events', text: 'Miller Center — Andrew Johnson: Key Events of His Presidency' }
                    ]
                },
                {
                    severity: 10,
                    title: 'Allowed Black Codes to Take Root Across the South',
                    shortLabel: 'Black Codes',
                    description: 'Following Johnson\'s rapid restoration of Southern state governments, those governments enacted Black Codes — comprehensive systems of laws designed to keep formerly enslaved people in conditions as close to slavery as possible. The codes restricted where Black people could live and work, criminalized unemployment, imposed curfews, denied the right to bear arms, and created systems of forced labor through vagrancy laws. Johnson did not write these laws, but his deliberate dismantling of federal oversight and his hostility to civil-rights enforcement created the political space in which they flourished. The Black Codes were a direct preview of the Jim Crow system that would follow Reconstruction\'s collapse.',
                    sources: [
                        { url: 'https://www.archives.gov/research/african-americans/freedmens-bureau', text: 'National Archives — Black Codes and Freedmen\'s Bureau Records' },
                        { url: 'https://www.loc.gov/exhibits/creating-the-united-states/reconstruction.html', text: 'Library of Congress — Reconstruction Era: Black Codes' }
                    ]
                },
                {
                    severity: 10,
                    title: 'Opposed the Fourteenth Amendment',
                    shortLabel: 'Opposed 14th Amendment',
                    description: 'Johnson actively opposed the Fourteenth Amendment, which established birthright citizenship, equal protection under the law, and due process rights — protections that became the constitutional foundation for American civil rights for the next 150 years. The Library of Congress documents his opposition to the amendment. Johnson urged Southern states not to ratify it, and most former Confederate states initially refused. Congress responded by requiring ratification as a condition of readmission to the Union. That Johnson positioned himself against what became one of the most consequential constitutional achievements in American history — in the immediate aftermath of slavery — encapsulates the moral character of his presidency.',
                    sources: [
                        { url: 'https://www.archives.gov/milestone-documents/14th-amendment', text: 'National Archives — 14th Amendment to the U.S. Constitution: Milestone Documents' },
                        { url: 'https://constitution.congress.gov/constitution/amendment-14/', text: 'Congress.gov — Fourteenth Amendment: Text, Annotations, and History' }
                    ]
                },
                {
                    severity: 8,
                    title: 'Racist Rhetoric and Political Agitation Against Reconstruction',
                    shortLabel: 'Racist Rhetoric',
                    description: 'During his 1866 "Swing Around the Circle" speaking tour, Johnson openly appealed to white racial grievance, attacked Radical Republicans as traitors, and argued against extending equal rights to Black Americans. His conduct on the tour — including undignified public arguments with hecklers — badly damaged his standing and inflamed political tensions at a moment when the country needed leadership capable of unifying around equal citizenship. Johnson\'s speeches explicitly framed Reconstruction as a threat to white Americans rather than a moral obligation to freedpeople, lending presidential legitimacy to white-supremacist resistance at its most critical and violent period.',
                    sources: [
                        { url: 'https://millercenter.org/president/johnson/campaigns-and-elections', text: 'Miller Center — Andrew Johnson: Swing Around the Circle and Political Agitation' },
                        { url: 'https://www.nps.gov/subjects/reconstruction/1866-congressional-elections.htm', text: 'National Park Service — The 1866 Elections and Johnson\'s Speaking Tour' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Failed to Protect Black Americans from White-Supremacist Massacres',
                    shortLabel: 'Racial Massacre Inaction',
                    description: 'In 1866, white mobs carried out large-scale massacres of Black residents and Union veterans in Memphis and New Orleans, killing dozens and injuring hundreds in each city. Congressional investigations documented the scale and brutality of the violence. Johnson\'s broader resistance to federal civil-rights enforcement — his dismantling of Reconstruction machinery and his rhetorical alignment with white Southern interests — created the political environment in which perpetrators believed they would face no federal consequences. He did not personally order the violence, but his policies and rhetoric strengthened the forces carrying it out rather than the federal authority that might have stopped it.',
                    sources: [
                        { url: 'https://www.nps.gov/subjects/reconstruction/memphis-massacre.htm', text: 'National Park Service — The Memphis Massacre of 1866' },
                        { url: 'https://www.nps.gov/subjects/reconstruction/new-orleans-massacre.htm', text: 'National Park Service — The New Orleans Massacre of 1866' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Triggered a Constitutional Crisis and Was Impeached',
                    shortLabel: 'Impeachment',
                    description: 'Johnson became the first U.S. president to be impeached when the House voted in 1868 to charge him with violating the Tenure of Office Act by removing Secretary of War Edwin Stanton without Senate approval. The immediate trigger was one personnel decision, but the impeachment was the culmination of a prolonged constitutional war between Johnson and Congress over Reconstruction authority. He survived removal in the Senate by a single vote. While historians debate whether the Tenure of Office Act charges alone justified removal, the impeachment was the institutional expression of how completely Johnson had broken with Congress\'s efforts to implement a meaningful postwar settlement.',
                    sources: [
                        { url: 'https://history.house.gov/Historical-Highlights/1851-1900/Andrew-Johnson-Impeachment/', text: 'U.S. House of Representatives — Andrew Johnson Impeachment: Historical Highlights' },
                        { url: 'https://www.senate.gov/artandhistory/history/common/briefing/Impeachment_Johnson.htm', text: 'U.S. Senate — Impeachment of Andrew Johnson' }
                    ]
                },
                {
                    severity: 10,
                    title: 'Prioritized White Southern Reconciliation Over Justice for Freedpeople',
                    shortLabel: 'White Reconciliation Over Justice',
                    description: 'Taken together, every major decision of Johnson\'s presidency pointed in the same direction: restore the antebellum South\'s white political structure as quickly as possible and leave Black civil rights to the states that had just fought a war to preserve slavery. His rapid pardons, his vetoes of civil-rights and Freedmen\'s Bureau legislation, his opposition to the Fourteenth Amendment, his tolerance of Black Codes, and his inflammatory rhetoric all served that single priority. The consequences were generational: Reconstruction\'s failure under Johnson\'s obstruction laid the groundwork for a century of Jim Crow, disfranchisement, and racial terror. Historians consistently rank his presidency among the worst in American history for precisely these reasons.',
                    sources: [
                        { url: 'https://www.nps.gov/subjects/reconstruction/failure-of-reconstruction.htm', text: 'National Park Service — The Failure of Reconstruction' },
                        { url: 'https://www.loc.gov/exhibits/creating-the-united-states/reconstruction.html', text: 'Library of Congress — The Legacy of Reconstruction' }
                    ]
                },
            ]
        },
        tRoosevelt: {
            id: 'tRoosevelt',
            firstName: 'Theodore',
            lastName: 'Roosevelt',
            displayName: 'T. Roosevelt',
            ordinal: 26,
            party: 'republican',
            portrait: '/assets/images/troosevelt.webp',
            bars: [
                {
                    severity: 8,
                    title: 'Continued U.S. Imperial War in the Philippines',
                    shortLabel: 'Philippines War',
                    description: 'Roosevelt inherited and continued the Philippine-American War, a brutal counterinsurgency campaign against Filipino independence fighters that involved widespread civilian suffering, torture, and massacres. U.S. soldiers used the "water cure" — a form of waterboarding — against Filipino prisoners, which became a major anti-imperialist scandal at the time. Congressional hearings documented the abuses. Historians estimate the war killed between 200,000 and 1 million Filipinos, the vast majority civilians, through combat, famine, and disease caused by U.S. military operations.',
                    sources: [
                        { url: 'https://www.loc.gov/collections/philippine-american-war/about-this-collection/', text: 'Library of Congress — The Philippine-American War: About This Collection' },
                        { url: 'https://www.senate.gov/artandhistory/history/common/generic/Philippine_Insurrection.htm', text: 'U.S. Senate — The Philippine-American War: Historical Overview' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Engineered the Panama Revolt to Seize the Canal Zone',
                    shortLabel: 'Panama Canal Coup',
                    description: 'When Colombia rejected the terms of Roosevelt\'s proposed canal treaty, his administration collaborated with Panamanian business interests to engineer Panama\'s secession. U.S. naval vessels were positioned nearby to prevent Colombian troops from suppressing the revolt, and Colombian soldiers were bribed not to resist. Roosevelt then quickly recognized the new Panamanian government and signed a canal treaty on favorable U.S. terms within days. He later boasted openly about his role. While the canal became one of the great engineering achievements of the era, its acquisition involved the deliberate subversion of Colombian sovereignty.',
                    sources: [
                        { url: 'https://history.state.gov/milestones/1899-1913/panama-canal', text: 'U.S. State Department Office of the Historian — The Panama Canal' },
                        { url: 'https://www.archives.gov/publications/prologue/2004/summer/panama-revolution.html', text: 'National Archives — The Panama Revolution of 1903' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Roosevelt Corollary and Claiming U.S. "Police Power" Over Latin America',
                    shortLabel: 'Roosevelt Corollary',
                    description: 'In 1904, Roosevelt expanded the Monroe Doctrine into the Roosevelt Corollary, asserting that the United States had the right to intervene militarily in Latin American countries deemed unstable, indebted, or misgoverned — effectively claiming a regional police power over sovereign nations. The State Department\'s own historians describe the shift as the U.S. taking on the role of "regional policeman." Anti-imperialists at the time criticized it for converting a defensive doctrine against European colonialism into a justification for U.S. military intervention against weaker neighbors. The Corollary provided the pretext for numerous U.S. interventions across the Caribbean and Central America over the following decades.',
                    sources: [
                        { url: 'https://history.state.gov/milestones/1899-1913/roosevelt-and-monroe-doctrine', text: 'U.S. State Department Office of the Historian — Roosevelt Corollary to the Monroe Doctrine' },
                        { url: 'https://www.archives.gov/education/lessons/monroe-doctrine', text: 'National Archives — The Monroe Doctrine and Roosevelt Corollary' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Dishonorably Discharged 167 Black Soldiers Without Trial',
                    shortLabel: 'Brownsville Affair',
                    description: 'In 1906, following a shooting incident in Brownsville, Texas, Roosevelt ordered the dishonorable discharge of all 167 Black soldiers of the 25th Infantry Regiment — without a trial, without individual findings of guilt, and without allowing the men to confront their accusers. The mass punishment stripped the soldiers of their pay, pensions, and the right to future federal employment. Many historians now regard it as one of the most egregious racial injustices carried out by a sitting president. Decades later Congress moved to correct the record, and the soldiers were eventually exonerated — long after most had died.',
                    sources: [
                        { url: 'https://www.nps.gov/articles/brownsville-affair.htm', text: 'National Park Service — The Brownsville Affair (1906)' },
                        { url: 'https://www.armyhistory.org/the-brownsville-affair/', text: 'Army Historical Foundation — The Brownsville Affair' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Held Racist and Eugenicist Views That Shaped Policy',
                    shortLabel: 'Eugenicism',
                    description: 'Roosevelt subscribed to the racial hierarchy theories and eugenicist ideology prevalent among white elites of his era, and his views were not merely private opinions — they influenced conservation policy, immigration restriction, and his approach to governance. The National Park Service documents that Roosevelt and other conservationists believed in eugenics and supported preventing people they deemed "inferior," including people of color and disabled people, from having children. He wrote and spoke extensively about fears of "race suicide" among white Americans. These views shaped federal policy and lent presidential legitimacy to a pseudoscientific movement that caused lasting harm.',
                    sources: [
                        { url: 'https://www.nps.gov/articles/000/roosevelt-and-eugenics.htm', text: 'National Park Service — Theodore Roosevelt and Eugenics' },
                        { url: 'https://www.theodorerooseveltcenter.org/Learn-About-TR/TR-Encyclopedia/Race-Ethnicity-and-Gender', text: 'Theodore Roosevelt Center — Race, Ethnicity, and Gender in Roosevelt\'s Thought' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Disregard for Colombian Sovereignty Over Panama',
                    shortLabel: 'Colombian Sovereignty',
                    description: 'Roosevelt\'s handling of Colombia in the canal negotiations was openly coercive. After Colombia\'s senate rejected the Hay-Herrán Treaty — a decision well within its sovereign rights — Roosevelt publicly derided Colombian officials, authorized support for the Panamanian independence movement, and dispatched warships to prevent Colombia from suppressing the revolt. He later acknowledged his aggressive role with apparent pride. The Theodore Roosevelt Center documents that Roosevelt sent warships to tacitly support the independence movement after Colombia rejected the canal terms. Colombia received a formal U.S. apology and $25 million in compensation in 1921, years after Roosevelt\'s death.',
                    sources: [
                        { url: 'https://www.theodorerooseveltcenter.org/Learn-About-TR/TR-Encyclopedia/Foreign-Affairs/Panama-Canal', text: 'Theodore Roosevelt Center — The Panama Canal' },
                        { url: 'https://history.state.gov/milestones/1899-1913/panama-canal', text: 'U.S. State Department — Panama Canal Negotiations and Colombia' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Roosevelt Corollary Used to Justify Debt-Collection Interventions',
                    shortLabel: 'Intervention Doctrine',
                    description: 'Beyond its defensive framing against European colonialism, the Roosevelt Corollary in practice authorized U.S. intervention in Latin American countries deemed fiscally irresponsible or politically unstable — effectively making indebtedness and internal disorder grounds for U.S. military occupation. Roosevelt applied this logic most directly in the Dominican Republic in 1905, placing U.S. officials in control of its customs revenues. Anti-imperialist critics at the time argued the Corollary transformed the Monroe Doctrine from a shield against European empire into a tool for American empire, with sovereign Latin American governments subject to U.S. veto over their domestic affairs.',
                    sources: [
                        { url: 'https://history.state.gov/milestones/1899-1913/roosevelt-and-monroe-doctrine', text: 'U.S. State Department — Roosevelt Corollary and Dominican Republic' },
                        { url: 'https://www.archives.gov/education/lessons/monroe-doctrine', text: 'National Archives — Monroe Doctrine Expansion Under Roosevelt' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Conservation Policy Built on Displacement of Native Land Use',
                    shortLabel: 'Native Land Conservation',
                    description: 'Roosevelt\'s conservation legacy is substantial — he protected roughly 230 million acres of public land — but the movement he championed treated Native American land use and stewardship as inferior or invisible. Federal conservation policy expanded government control over lands that Indigenous nations had managed for generations, often without meaningful consultation or compensation, and the "wilderness" ideal embedded in conservation law reflected a view of nature as uninhabited that erased existing Native presence. This is a structural criticism rather than a single act, but it represents a real and documented cost of Roosevelt\'s conservation program.',
                    sources: [
                        { url: 'https://www.nps.gov/articles/000/roosevelt-conservation.htm', text: 'National Park Service — Theodore Roosevelt and Conservation' },
                        { url: 'https://www.doi.gov/sites/doi.gov/files/uploads/doi-report-on-land-acknowledgement.pdf', text: 'Department of the Interior — Indigenous Land and Conservation History' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Expanded Unilateral Executive Power',
                    shortLabel: 'Executive Overreach',
                    description: 'Roosevelt aggressively expanded the scope and assertiveness of the presidency, acting on a "stewardship theory" that the president could do anything not explicitly forbidden by the Constitution. While this produced genuine domestic achievements in conservation and regulation, it also normalized unilateral executive action in foreign affairs, bypassed Congress on treaty-adjacent arrangements, and set precedents for a more imperial presidency. His admirers credit this energy as transformative; critics, including his successor William Howard Taft, argued it exceeded constitutional bounds and established a model of executive unilateralism that outlasted his specific causes.',
                    sources: [
                        { url: 'https://millercenter.org/president/roosevelt/key-events', text: 'Miller Center — Theodore Roosevelt: Executive Power and the Stewardship Theory' },
                        { url: 'https://www.britannica.com/biography/Theodore-Roosevelt/Presidency', text: 'Britannica — Theodore Roosevelt: The Presidency and Executive Power' }
                    ]
                },
                {
                    severity: 6,
                    title: '"Big Stick" Militarism and Normalization of Coercive Diplomacy',
                    shortLabel: 'Big Stick Policy',
                    description: 'Roosevelt\'s "speak softly and carry a big stick" foreign policy doctrine made military threat a routine instrument of U.S. diplomacy, particularly toward smaller and weaker nations. While Roosevelt avoided large-scale wars among major powers and won the Nobel Peace Prize for mediating the Russo-Japanese War, the "big stick" was wielded most freely against Latin American and Caribbean nations that lacked the power to resist. The doctrine normalized a posture in which U.S. strategic and commercial interests could override the sovereignty of weaker states, laying the groundwork for decades of interventionist U.S. foreign policy in the Western Hemisphere.',
                    sources: [
                        { url: 'https://history.state.gov/milestones/1899-1913/big-stick', text: 'U.S. State Department Office of the Historian — "Big Stick" Diplomacy' },
                        { url: 'https://www.britannica.com/topic/Big-Stick-policy', text: 'Britannica — Big Stick Policy: Origins and Legacy' }
                    ]
                },
            ]
        },
        fdRoosevelt: {
            id: 'fdRoosevelt',
            firstName: 'Franklin D.',
            lastName: 'Roosevelt',
            displayName: 'F.D. Roosevelt',
            ordinal: 32,
            party: 'democrat',
            portrait: '/assets/images/fdr.webp',
            bars: [
                {
                    severity: 10,
                    title: 'Japanese American Internment',
                    shortLabel: 'Japanese Internment',
                    description: 'In February 1942, Roosevelt signed Executive Order 9066, authorizing the creation of military exclusion zones that led to the forced removal and mass incarceration of approximately 125,000 people of Japanese ancestry — the majority of them U.S.-born citizens who had committed no crime. Families were given days to dispose of their homes and businesses before being transported to remote camps surrounded by barbed wire and armed guards, where they were held for years. The National Archives documents the order\'s direct role in the removals. In 1988, Congress formally acknowledged the internment as a "grave injustice" driven by "racial prejudice, war hysteria, and a failure of political leadership" and paid reparations to survivors.',
                    sources: [
                        { url: 'https://www.archives.gov/milestone-documents/executive-order-9066', text: 'National Archives — Executive Order 9066: Milestone Documents' },
                        { url: 'https://www.densho.org/executive-order-9066/', text: 'Densho Encyclopedia — Executive Order 9066 and Japanese American Incarceration' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Refused Jewish Refugees Aboard the St. Louis',
                    shortLabel: 'St. Louis Refugees',
                    description: 'In May 1939, the German ocean liner St. Louis departed Hamburg carrying 937 passengers, nearly all of them Jewish refugees fleeing Nazi persecution. After Cuba refused entry, the ship sailed along the U.S. coastline seeking asylum. The Roosevelt administration declined to admit the passengers, citing immigration quotas and State Department restrictions, even as the ship waited within sight of Miami. The vessel was forced to return to Europe. The U.S. Holocaust Memorial Museum documents that 254 of those passengers were subsequently murdered in the Holocaust. The episode remains one of the most documented instances of the administration\'s failure to act when action was possible.',
                    sources: [
                        { url: 'https://encyclopedia.ushmm.org/content/en/article/the-voyage-of-the-st-louis', text: 'U.S. Holocaust Memorial Museum — The Voyage of the St. Louis' },
                        { url: 'https://www.archives.gov/research/holocaust', text: 'National Archives — Holocaust-Era Records and U.S. Policy' }
                    ]
                },
                {
                    severity: 8,
                    title: 'Broader Failure to Admit Jewish Refugees During the Holocaust',
                    shortLabel: 'Holocaust Refugees',
                    description: 'The St. Louis was the most visible case, but the broader failure of FDR\'s administration to use available executive authority to ease immigration restrictions and rescue Jews fleeing Nazi persecution is a sustained and documented criticism. The State Department under Secretary Cordell Hull actively obstructed refugee admissions and suppressed reports of mass killings. The War Refugee Board — which FDR eventually created in January 1944 — came years after the scale of the Holocaust was known inside the administration. Historians including David Wyman have argued that earlier, more aggressive action could have saved hundreds of thousands of lives, and that domestic antisemitism and political calculation drove the inaction more than true legal constraint.',
                    sources: [
                        { url: 'https://encyclopedia.ushmm.org/content/en/article/the-united-states-and-the-holocaust', text: 'U.S. Holocaust Memorial Museum — The United States and the Holocaust' },
                        { url: 'https://www.archives.gov/research/holocaust/article.html', text: 'National Archives — America and the Holocaust: Documenting the Failure' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Tried to Pack the Supreme Court',
                    shortLabel: 'Court-Packing Plan',
                    description: 'After the Supreme Court struck down several major New Deal programs, FDR proposed the Judicial Procedures Reform Bill of 1937, which would have allowed him to appoint an additional justice for every sitting justice over the age of 70 — potentially expanding the Court to 15 members. The Federal Judicial Center states plainly that his motive was to reshape the Court\'s ideological balance to stop it from invalidating his legislation. The plan was rejected even by a Congress dominated by his own party, with members of both parties condemning it as an assault on judicial independence. It remains one of the most direct attempts by a president to subordinate the judiciary to executive will.',
                    sources: [
                        { url: 'https://www.fjc.gov/history/courts/packing-supreme-court', text: 'Federal Judicial Center — FDR\'s Court-Packing Plan' },
                        { url: 'https://www.archives.gov/exhibits/new-deal', text: 'National Archives — The New Deal and the Supreme Court Conflict' }
                    ]
                },
                {
                    severity: 7,
                    title: 'New Deal Housing Policy Entrenched Racial Segregation',
                    shortLabel: 'Redlining & Segregation',
                    description: 'New Deal housing programs helped millions of white Americans build generational wealth through homeownership, but the same federal apparatus systematically excluded Black Americans. The Home Owners\' Loan Corporation produced color-coded maps — the origin of "redlining" — that designated Black and immigrant neighborhoods as high-risk, denying residents access to federally backed mortgages. The Federal Housing Administration then reinforced segregation by refusing to insure mortgages in integrated neighborhoods and explicitly requiring racially restrictive covenants in new developments. The National Community Reinvestment Coalition has documented how these policies created racial wealth gaps that persisted for generations. The New Deal\'s most transformative domestic benefit was deliberately structured to exclude Black Americans.',
                    sources: [
                        { url: 'https://ncrc.org/holc/', text: 'National Community Reinvestment Coalition — HOLC Redlining Maps' },
                        { url: 'https://www.npr.org/2017/05/03/526655831/a-forgotten-history-of-how-the-u-s-government-segregated-america', text: 'NPR — A Forgotten History of How the U.S. Government Segregated America (May 2017)' }
                    ]
                },
                {
                    severity: 7,
                    title: 'New Deal Excluded Most Black Workers from Key Protections',
                    shortLabel: 'Black Workers Excluded',
                    description: 'The Social Security Act of 1935 and the National Labor Relations Act deliberately excluded agricultural workers and domestic servants from their protections — categories that encompassed the majority of Black workers in the South. This was not accidental: the exclusions were conditions demanded by Southern Democratic congressmen whose support FDR needed to pass the legislation. The result was that the New Deal\'s most durable economic protections — retirement insurance, unemployment benefits, and the right to organize — were structurally denied to Black Americans at the moment they were extended to the broader workforce, deepening racial economic inequality for generations.',
                    sources: [
                        { url: 'https://www.ssa.gov/history/reports/acsim/ACSIMonline.pdf', text: 'Social Security Administration — Historical Context of the Social Security Act and Racial Exclusions' },
                        { url: 'https://www.epi.org/publication/new-deal-left-out-black-workers/', text: 'Economic Policy Institute — How the New Deal Left Out Black Workers' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Firebombing Campaigns Against Civilian-Dense Cities',
                    shortLabel: 'Civilian Firebombing',
                    description: 'As commander in chief, FDR bore command responsibility for the Allied strategic bombing campaigns of World War II, which increasingly targeted civilian-dense urban areas. The March 9–10, 1945 firebombing of Tokyo — the single deadliest air raid in history — killed an estimated 80,000 to 100,000 civilians in a single night, destroying sixteen square miles of the city. Similar area-bombing campaigns devastated Dresden and dozens of other German cities. Military historians debate the strategic necessity and distribution of responsibility across Allied command, but the campaigns represented a deliberate shift toward targeting civilian infrastructure and population centers that caused mass noncombatant death.',
                    sources: [
                        { url: 'https://www.afhistory.af.mil/News/Article-Display/Article/458980/the-bombing-of-japan/', text: 'Air Force Historical Research Agency — Strategic Bombing of Japan' },
                        { url: 'https://www.britannica.com/event/firebombing-of-Tokyo', text: 'Britannica — Firebombing of Tokyo (March 1945)' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Yalta Concessions and Soviet Domination of Eastern Europe',
                    shortLabel: 'Yalta Concessions',
                    description: 'At the Yalta Conference in February 1945, a visibly ill FDR negotiated postwar arrangements with Churchill and Stalin that critics have long argued were excessively favorable to Soviet interests. The agreements effectively acknowledged Soviet influence over Poland and much of Eastern Europe, with democratic election pledges that Stalin promptly ignored. The State Department\'s own historical office notes that critics accused FDR of "handing over" Eastern Europe and parts of Northeast Asia, though defenders argue his negotiating position was constrained by Soviet military realities on the ground and the need for Soviet entry into the Pacific war. The debate remains genuinely contested among historians.',
                    sources: [
                        { url: 'https://history.state.gov/milestones/1937-1945/yalta-conf', text: 'U.S. State Department Office of the Historian — The Yalta Conference (1945)' },
                        { url: 'https://www.britannica.com/event/Yalta-Conference', text: 'Britannica — Yalta Conference: Outcomes and Legacy' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Mass Incarceration System Beyond the Initial Order',
                    shortLabel: 'Internment Infrastructure',
                    description: 'Executive Order 9066 was not a one-time decision but the foundation for a large administrative apparatus of mass incarceration that expanded over years. The Truman Library documents that more than 100,000 Japanese Americans were placed into internment camps in the six months following the order, held in facilities administered by the War Relocation Authority across desolate sites in California, Arizona, Idaho, Wyoming, Colorado, Utah, and Arkansas. Internees lost homes, businesses, farms, and savings. The incarceration continued until 1945, and the Supreme Court upheld it in Korematsu v. United States — a ruling not formally repudiated until 2018.',
                    sources: [
                        { url: 'https://www.trumanlibrary.gov/education/presidential-inquiries/japanese-american-internment', text: 'Truman Presidential Library — Japanese American Internment' },
                        { url: 'https://encyclopedia.densho.org/War_Relocation_Authority/', text: 'Densho Encyclopedia — War Relocation Authority' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Dramatic and Contested Expansion of Executive Power',
                    shortLabel: 'Executive Power Expansion',
                    description: 'FDR transformed the American presidency, expanding its reach through emergency banking actions, the creation of dozens of New Deal agencies, wartime executive authority, and a four-term tenure that reshaped expectations of presidential power. Many of these expansions addressed genuine crises and produced lasting public benefits. But critics across the political spectrum have argued that FDR normalized a model of executive governance that bypassed Congress, pushed constitutional boundaries, and built a federal administrative state with limited democratic accountability. The court-packing plan was the most overt expression of this tendency, but it ran throughout his presidency.',
                    sources: [
                        { url: 'https://millercenter.org/president/fdroosevelt/key-events', text: 'Miller Center — Franklin D. Roosevelt: Key Events and Executive Power' },
                        { url: 'https://www.brookings.edu/articles/fdr-and-the-modern-presidency/', text: 'Brookings Institution — FDR and the Modern Presidency' }
                    ]
                },
            ]
        },
        jefferson: {
            id: 'jefferson',
            firstName: 'Thomas',
            lastName: 'Jefferson',
            ordinal: 3,
            party: 'democratic-republican',
            portrait: '/assets/images/jefferson.webp',
            bars: [
                {
                    severity: 10,
                    title: 'Enslaved More Than 600 People Over His Lifetime',
                    shortLabel: 'Enslaved 600+ People',
                    description: 'Over the course of his life, Jefferson enslaved more than 600 people. Monticello\'s own research documents that he freed only ten people in total — all from the same family — while hundreds of others remained enslaved or were sold after his death to satisfy his debts. He lived in luxury at Monticello through the forced, uncompensated labor of enslaved people, including skilled artisans, domestic workers, and agricultural laborers. The scale of his slaveholding places him among the largest enslavers among American presidents, and the near-total failure to free those he enslaved — even upon his death — stands in direct and irreconcilable contradiction to his most celebrated political writing.',
                    sources: [
                        { url: 'https://www.monticello.org/thomas-jefferson/jefferson-slavery/', text: 'Monticello — Thomas Jefferson and Slavery' },
                        { url: 'https://www.whitehousehistory.org/slavery-in-the-white-house-thomas-jefferson', text: 'White House Historical Association — Slavery in the White House: Thomas Jefferson' }
                    ]
                },
                {
                    severity: 10,
                    title: 'Fathered Children with Sally Hemings, a Woman He Enslaved',
                    shortLabel: 'Sally Hemings',
                    description: 'The Thomas Jefferson Foundation at Monticello considers it settled historical fact that Jefferson fathered six children with Sally Hemings, an enslaved woman who was also the half-sister of his late wife. Hemings was legally his property, had no right to refuse, and had no standing to leave. The relationship existed entirely within a structure of absolute power — she could be sold, separated from her children, or punished at his discretion. Modern ethical frameworks cannot treat this as consensual in any meaningful sense. Jefferson never freed Hemings during his lifetime; she obtained her freedom only informally after his death through his son Madison.',
                    sources: [
                        { url: 'https://www.monticello.org/thomas-jefferson/jefferson-slavery/thomas-jefferson-and-sally-hemings-a-brief-account/', text: 'Monticello — Thomas Jefferson and Sally Hemings: A Brief Account' },
                        { url: 'https://www.smithsonianmag.com/history/the-truth-about-jefferson-180975789/', text: 'Smithsonian Magazine — The Truth About Jefferson and Sally Hemings' }
                    ]
                },
                {
                    severity: 10,
                    title: 'Failed to Act Against Slavery Despite Acknowledging It Was Wrong',
                    shortLabel: 'Slavery Hypocrisy',
                    description: 'Jefferson repeatedly acknowledged in his private writings and public statements that slavery was a moral evil and a danger to the republic, yet he continued to profit from it his entire life, freed almost none of the people he enslaved, and did not use his extraordinary political influence — as the author of the Declaration of Independence, as Secretary of State, as Vice President, and as a two-term president — to advance any serious program of abolition. His intellectual prestige made this failure especially consequential: more than almost any figure in the early republic, Jefferson had the credibility to push against slavery\'s expansion and chose not to. The gap between his stated principles and his actions helped normalize the contradiction at the heart of American democracy.',
                    sources: [
                        { url: 'https://www.monticello.org/thomas-jefferson/jefferson-slavery/jefferson-s-attitudes-toward-slavery/', text: 'Monticello — Jefferson\'s Attitudes Toward Slavery' },
                        { url: 'https://www.loc.gov/collections/thomas-jefferson-papers/articles-and-essays/jefferson-and-slavery/', text: 'Library of Congress — Jefferson and Slavery' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Promoted Racist Theories of Black Inferiority',
                    shortLabel: 'Racist Ideology',
                    description: 'In Notes on the State of Virginia, Jefferson wrote at length that Black people were inferior to white people in "body and mind" — deficient in reason, imagination, and beauty. He presented these views not as prejudice but as considered scientific observation, lending the authority of one of America\'s foremost intellectuals to white supremacist ideology at the moment the nation\'s racial order was being constructed. Because Jefferson was the era\'s most influential American political thinker, his racial theories carried exceptional legitimating weight — helping to provide intellectual scaffolding for the defense of slavery and, later, for scientific racism and segregationist ideology throughout the nineteenth and twentieth centuries.',
                    sources: [
                        { url: 'https://www.monticello.org/research-education/thomas-jefferson-encyclopedia/notes-state-virginia/', text: 'Monticello — Notes on the State of Virginia' },
                        { url: 'https://www.loc.gov/resource/mtj1.024_0368_0380/', text: 'Library of Congress — Notes on the State of Virginia: Original Text' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Louisiana Purchase Expanded Territory for Slavery and Native Dispossession',
                    shortLabel: 'Louisiana Purchase',
                    description: 'The Louisiana Purchase of 1803 doubled the size of the United States and is widely celebrated as a diplomatic achievement, but it also opened an enormous new continental interior to westward expansion, the dispossession of Native nations, and the spread of slavery. The purchase intensified the sectional crisis over whether slavery would expand into new territories — a conflict that culminated in the Civil War. Jefferson also knew the purchase sat uneasily with his own strict-constructionist constitutional principles, privately admitting it exceeded his reading of presidential authority but proceeding anyway, prioritizing political expediency over the constitutional limits he had spent his career championing.',
                    sources: [
                        { url: 'https://history.state.gov/milestones/1801-1829/louisiana-purchase', text: 'U.S. State Department Office of the Historian — The Louisiana Purchase (1803)' },
                        { url: 'https://www.archives.gov/exhibits/american_originals/louistxt.html', text: 'National Archives — Louisiana Purchase Treaty' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Laid Groundwork for Native American Removal Through Debt and Coercion',
                    shortLabel: 'Native Removal Groundwork',
                    description: 'Jefferson\'s Native American policy promoted "civilization" programs and land cession treaties as official federal strategy, but his private correspondence reveals a more deliberate and coercive design. He wrote to government officials that encouraging Native nations to accumulate debt through federal trading posts would pressure them into selling land to repay what they owed — a strategy of engineered economic dependency used to extract territorial concessions. While Jefferson\'s policies were less immediately violent than Andrew Jackson\'s forced removal program, historians recognize them as a direct intellectual and policy predecessor to the Indian Removal Act of 1830, providing the framework and justifications that later administrations built upon.',
                    sources: [
                        { url: 'https://www.monticello.org/thomas-jefferson/jefferson-and-native-americans/', text: 'Monticello — Thomas Jefferson and Native Americans' },
                        { url: 'https://history.state.gov/milestones/1801-1829/native-american-diplomacy', text: 'U.S. State Department — Jefferson\'s Native American Policy' }
                    ]
                },
                {
                    severity: 5,
                    title: 'The Embargo Act Devastated American Commerce',
                    shortLabel: 'Embargo Act',
                    description: 'Jefferson\'s Embargo Act of 1807 prohibited American ships from engaging in foreign trade in an attempt to economically pressure Britain and France to respect U.S. neutral shipping rights during the Napoleonic Wars. The policy failed entirely as a diplomatic instrument — neither Britain nor France changed course — while inflicting severe economic damage on American merchants, sailors, farmers, and port communities, particularly in New England. The embargo is widely regarded as one of the most damaging peacetime economic policies in early American history. Jefferson eventually acknowledged its failure and signed its repeal three days before leaving office.',
                    sources: [
                        { url: 'https://www.monticello.org/research-education/thomas-jefferson-encyclopedia/embargo-act-1807/', text: 'Monticello — The Embargo Act of 1807' },
                        { url: 'https://history.state.gov/milestones/1801-1829/embargo-act', text: 'U.S. State Department Office of the Historian — The Embargo Act of 1807' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Enforced the Embargo with Sweeping Federal Powers He Opposed in Principle',
                    shortLabel: 'Embargo Enforcement',
                    description: 'The enforcement of the Embargo Act required the kind of intrusive federal authority over commerce and individual behavior that Jefferson had spent his political career condemning as tyrannical. To suppress widespread smuggling — particularly in New England and along the Canadian border — his administration obtained broad enforcement powers, authorized warrantless searches of vessels and warehouses, and deployed military force against American citizens engaged in trade. The spectacle of Jefferson, the great champion of limited government and states\' rights, presiding over an aggressive federal enforcement regime against his own citizens was politically devastating and exposed a deep contradiction between his constitutional principles and his exercise of presidential power.',
                    sources: [
                        { url: 'https://www.loc.gov/law/help/statutes-at-large/10th-congress/session-2/c10s2ch5.pdf', text: 'Library of Congress — Embargo Act Enforcement Legislation (1808)' },
                        { url: 'https://www.britannica.com/event/Embargo-Act', text: 'Britannica — Embargo Act: Enforcement and Consequences' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Constitutional Flexibility Contradicted His Own Principles',
                    shortLabel: 'Constitutional Hypocrisy',
                    description: 'Jefferson built his political identity in large part on strict constitutional construction — the argument that the federal government could exercise only powers explicitly granted to it by the Constitution. As president, he abandoned this principle when it suited him, most visibly with the Louisiana Purchase, for which he privately acknowledged there was no clear constitutional authority. He chose to proceed rather than seek a constitutional amendment, prioritizing the political and strategic opportunity over his stated principles. The pattern of Jefferson invoking constitutional limits against his opponents while disregarding them when in power is one of the most consistently noted contradictions of his presidency.',
                    sources: [
                        { url: 'https://millercenter.org/president/jefferson/key-events', text: 'Miller Center — Thomas Jefferson: Key Events of His Presidency' },
                        { url: 'https://www.britannica.com/biography/Thomas-Jefferson/President-of-the-United-States', text: 'Britannica — Thomas Jefferson: The Presidency' }
                    ]
                },
                {
                    severity: 8,
                    title: 'Democratic Ideals Built on Deliberate Exclusion',
                    shortLabel: 'Exclusionary Democracy',
                    description: 'Jefferson\'s contributions to American democratic language — most powerfully "all men are created equal" — are foundational, but his actual vision of political life systematically excluded the majority of people living in the republic he helped create. Enslaved people, free Black people, Native Americans, women, and landless white men were excluded from the political equality Jefferson articulated. This was not accidental or merely a reflection of his era — Jefferson actively defended and sustained the institutions, laws, and ideological frameworks that kept these groups outside the polity. The result was a nation whose founding language promised universal human equality and whose founding institutions were deliberately structured to deny it, a contradiction Jefferson did more than almost anyone to both create and entrench.',
                    sources: [
                        { url: 'https://www.loc.gov/exhibits/jefferson/jeffamer.html', text: 'Library of Congress — Jefferson\'s Vision for America' },
                        { url: 'https://www.monticello.org/research-education/thomas-jefferson-encyclopedia/liberty-and-slavery/', text: 'Monticello — Liberty and Slavery: The Paradox of Jefferson' }
                    ]
                },
            ]
        },
        hoover: {
            id: 'hoover',
            firstName: 'Herbert',
            lastName: 'Hoover',
            ordinal: 31,
            party: 'republican',
            portrait: '/assets/images/hoover.webp',
            bars: [
                {
                    severity: 9,
                    title: 'Failed to Respond Adequately to the Great Depression',
                    shortLabel: 'Depression Response',
                    description: 'Hoover did not cause the Great Depression, but his response to it — rooted in a philosophical commitment to voluntarism, private charity, and local relief over direct federal action — left millions of Americans without meaningful help during the worst economic collapse in the nation\'s history. Unemployment reached 25 percent, banks failed by the thousands, and farm incomes collapsed while Hoover resisted direct federal relief on the grounds that it would undermine individual character and expand government inappropriately. The Miller Center notes his Depression response has defined his historical legacy. When federal intervention did come, it was too limited and too late to prevent catastrophic human suffering or his landslide electoral defeat.',
                    sources: [
                        { url: 'https://millercenter.org/president/hoover/domestic-affairs', text: 'Miller Center — Herbert Hoover: Domestic Affairs and the Great Depression' },
                        { url: 'https://hoover.archives.gov/info/depression.html', text: 'Herbert Hoover Presidential Library — Hoover and the Great Depression' }
                    ]
                },
                {
                    severity: 8,
                    title: 'Withheld Direct Federal Relief from Unemployed and Hungry Americans',
                    shortLabel: 'Denied Federal Relief',
                    description: 'Throughout the early years of the Depression, Hoover refused to authorize direct federal relief for unemployed and destitute Americans, insisting that local governments, charities, and voluntary cooperation were the appropriate response to mass unemployment and hunger. Private charity and state resources were catastrophically overwhelmed. He eventually signed the Emergency Relief and Construction Act in July 1932 — allowing the Reconstruction Finance Corporation to lend $300 million to states for relief purposes — but this came nearly three years into the Depression and months before he left office. By then, Hoovervilles had become a national symbol of his administration\'s inadequate response to the scale of the crisis.',
                    sources: [
                        { url: 'https://www.federalreservehistory.org/essays/reconstruction-finance-corp', text: 'Federal Reserve History — The Reconstruction Finance Corporation' },
                        { url: 'https://hoover.archives.gov/info/depression.html', text: 'Herbert Hoover Presidential Library — Relief Policy During the Depression' }
                    ]
                },
                {
                    severity: 8,
                    title: 'Signed the Smoot-Hawley Tariff',
                    shortLabel: 'Smoot-Hawley Tariff',
                    description: 'In June 1930, Hoover signed the Smoot-Hawley Tariff Act, raising import duties on more than 20,000 goods to record levels at precisely the moment the global economy was contracting. More than 1,000 economists signed a public petition urging him to veto it. Trading partners retaliated with their own tariffs, global trade collapsed, and the international economic contraction deepened. While the Great Depression had many causes and Smoot-Hawley alone did not create it, economists and historians widely regard the Act as a serious policy error that worsened and prolonged the downturn by choking off international trade at the worst possible moment.',
                    sources: [
                        { url: 'https://www.senate.gov/artandhistory/history/minute/Smoot_Hawley_Tariff.htm', text: 'U.S. Senate — Smoot-Hawley Tariff: Historical Minute Essay' },
                        { url: 'https://www.econlib.org/library/Enc/SmootHawleyTariff.html', text: 'Library of Economics and Liberty — Smoot-Hawley Tariff' }
                    ]
                },
                {
                    severity: 8,
                    title: 'Ordered the Forcible Eviction of the Bonus Army',
                    shortLabel: 'Bonus Army Eviction',
                    description: 'In the summer of 1932, roughly 43,000 people — including World War I veterans, their families, and supporters — marched on Washington to demand early payment of service bonuses promised for 1945. After Congress rejected the bonus bill, Hoover ordered federal troops to clear veterans from occupied federal property. General Douglas MacArthur exceeded those orders, driving veterans and their families from all their camps with cavalry, infantry, and tanks, burning their shelters to the ground. Images of the U.S. Army turning on desperate veterans who had fought in the World War were politically devastating and morally damning, becoming one of the defining moments of Hoover\'s presidency.',
                    sources: [
                        { url: 'https://www.history.com/topics/great-depression/bonus-army', text: 'History.com — The Bonus Army: World War I Veterans\' March on Washington' },
                        { url: 'https://www.archives.gov/publications/prologue/2006/summer/bonus-army.html', text: 'National Archives — The Bonus Army (Prologue, Summer 2006)' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Rescued Banks While Leaving Ordinary Americans Without Help',
                    shortLabel: 'Banks Over People',
                    description: 'Hoover\'s Reconstruction Finance Corporation, created in January 1932, provided emergency loans to banks, railroads, insurance companies, and other large financial institutions. While financial system stabilization had genuine economic logic, the political and human reality was stark: institutions deemed too important to fail received federal assistance while millions of unemployed Americans were told direct relief was not the government\'s responsibility. The Federal Reserve History notes the RFC\'s mandate was emergency financing for financial institutions; the theory that RFC loans would flow through banks and businesses to workers proved wrong in practice — banks hoarded capital and businesses did not hire. The contrast between institutional rescue and individual abandonment became the defining image of Hoover\'s failure.',
                    sources: [
                        { url: 'https://www.federalreservehistory.org/essays/reconstruction-finance-corp', text: 'Federal Reserve History — The Reconstruction Finance Corporation' },
                        { url: 'https://www.trumanlibrary.gov/education/presidential-inquiries/reconstruction-finance-corporation', text: 'Truman Presidential Library — The Reconstruction Finance Corporation' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Raised Taxes During the Depression',
                    shortLabel: 'Depression-Era Tax Hike',
                    description: 'In 1932, Hoover signed the Revenue Act, which sharply increased income tax rates — raising the top marginal rate from 25 percent to 63 percent — along with new taxes on corporations, estates, and a broad range of consumer goods, in an effort to balance the federal budget and preserve the government\'s credit. The balanced-budget impulse was conventional wisdom among policymakers of the era, but in hindsight the Revenue Act was deeply contractionary: raising taxes during a collapsing economy withdrew purchasing power from a system already in freefall, reducing demand and deepening the contraction. Most economic historians view it as one of the worst fiscal policy decisions of the Depression era.',
                    sources: [
                        { url: 'https://www.taxfoundation.org/revenue-act-1932/', text: 'Tax Foundation — The Revenue Act of 1932' },
                        { url: 'https://www.cbo.gov/sites/default/files/cbofiles/ftpdocs/83xx/doc8366/maintext.3.1.shtml', text: 'Congressional Budget Office — Historical Tax Policy: The 1932 Revenue Act in Context' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Presided Over Mass Deportation of Mexicans and Mexican Americans',
                    shortLabel: 'Mexican Repatriation',
                    description: 'During Hoover\'s presidency, a coordinated campaign of federal deportations and local coercion pressured hundreds of thousands of people of Mexican origin to leave the United States, including large numbers of U.S.-born citizens with full legal rights. The Labor Department under Hoover\'s appointee William Doak intensified deportation enforcement, and federal action created political cover for state and local campaigns of intimidation and forced removal. Digital History documents that 82,400 people were involuntarily deported by federal authorities, while local pressure drove many more to leave. Decades later, the state of California formally apologized for its role in what it acknowledged were unconstitutional deportations of American citizens.',
                    sources: [
                        { url: 'https://www.digitalhistory.uh.edu/disp_textbook.cfm?smtID=2&psid=3479', text: 'Digital History — Mexican Repatriation During the Great Depression' },
                        { url: 'https://www.loc.gov/item/2021387543/', text: 'Library of Congress — Mexican Repatriation: Primary Source Documentation' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Nominated John J. Parker to the Supreme Court',
                    shortLabel: 'Parker Nomination',
                    description: 'In 1930, Hoover nominated Judge John J. Parker of North Carolina to the Supreme Court. Parker was opposed by the American Federation of Labor over a ruling that upheld "yellow dog" contracts barring workers from joining unions, and by the NAACP over statements he had made opposing Black political participation in elections. The Senate rejected the nomination 41–39 in a significant early defeat for Hoover. The episode was a meaningful failure of political judgment that damaged Hoover\'s standing with both organized labor and Black voters — constituencies whose support Republicans could not afford to lose heading into a difficult economic and electoral environment.',
                    sources: [
                        { url: 'https://www.senate.gov/artandhistory/history/common/generic/nominations_parker.htm', text: 'U.S. Senate — Rejection of the John J. Parker Nomination (1930)' },
                        { url: 'https://www.fjc.gov/history/judges/parker-john-johnston', text: 'Federal Judicial Center — John J. Parker: Biographical Data' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Weak Civil Rights Leadership During a Period of Severe Racial Inequality',
                    shortLabel: 'Civil Rights Failure',
                    description: 'Hoover did not make racial equality a meaningful presidential priority, and his relationship with Black Americans — who had been a significant Republican constituency since Reconstruction — deteriorated sharply during his presidency. The Parker nomination was the most visible symbol of this failure. More broadly, Black Americans experienced the Depression in its most severe form, routinely excluded from local relief programs by discriminatory administrators, denied agricultural assistance, and shut out of public works jobs. Hoover\'s limited federal relief approach left Black communities exposed to exactly these local discriminatory systems without meaningful federal protection or redress.',
                    sources: [
                        { url: 'https://millercenter.org/president/hoover/domestic-affairs', text: 'Miller Center — Hoover\'s Civil Rights Record' },
                        { url: 'https://www.naacp.org/naacp-history-and-the-great-depression/', text: 'NAACP — Civil Rights and the Great Depression Era' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Persistently Underestimated the Scale and Duration of the Crisis',
                    shortLabel: 'Crisis Underestimation',
                    description: 'Throughout the Depression\'s early years, Hoover repeatedly predicted imminent recovery and framed the crisis as a manageable disruption that could be addressed through confidence-building, voluntary cooperation, and limited credit interventions. His public optimism — including statements that "prosperity is just around the corner" — became politically toxic as conditions worsened and millions remained destitute. Whether rooted in genuine belief or a calculated attempt to prevent panic, the persistent gap between Hoover\'s reassurances and the lived reality of Americans losing homes, farms, and livelihoods contributed to the collapse of public trust in his administration and the perception that he was fundamentally detached from the scale of national suffering.',
                    sources: [
                        { url: 'https://millercenter.org/president/hoover/key-events', text: 'Miller Center — Herbert Hoover: Key Events of His Presidency' },
                        { url: 'https://hoover.archives.gov/info/depression.html', text: 'Herbert Hoover Presidential Library — Hoover\'s Public Statements on the Depression' }
                    ]
                },
            ]
        },
        cleveland: {
            id: 'cleveland',
            firstName: 'Grover',
            lastName: 'Cleveland',
            ordinal: [22, 24],
            party: 'democrat',
            portrait: '/assets/images/cleveland.webp',
            bars: [
                {
                    severity: 8,
                    title: 'Sent Federal Troops to Break the Pullman Strike',
                    shortLabel: 'Pullman Strike',
                    description: 'In 1894, when workers at the Pullman Palace Car Company walked off the job over wage cuts and were joined in a sympathy boycott by members of the American Railway Union, Cleveland\'s administration obtained a sweeping federal injunction against the strike and deployed federal troops to Chicago over the objection of Illinois Governor John Altgeld, who had not requested them. Violence followed the troop deployment; National Guardsmen fired into crowds, killing between 4 and 30 people depending on the account. The strike collapsed, ARU leader Eugene Debs was imprisoned for contempt of the injunction, and Cleveland was broadly seen as having used the full machinery of federal government — courts, injunctions, and military force — to destroy organized labor on behalf of railroad corporations.',
                    sources: [
                        { url: 'https://www.britannica.com/event/Pullman-Strike', text: 'Britannica — The Pullman Strike (1894)' },
                        { url: 'https://www.nlrb.gov/about-nlrb/who-we-are/our-history/1894-pullman-strike', text: 'National Labor Relations Board — The 1894 Pullman Strike' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Used Federal Power Systematically Against Organized Labor',
                    shortLabel: 'Anti-Labor Policy',
                    description: 'The Pullman Strike was the most dramatic episode, but it reflected a broader pattern in Cleveland\'s presidency of deploying federal authority on behalf of employers and railroad corporations against workers demanding fairer conditions. Cleveland justified the Pullman intervention on grounds of protecting mail delivery and interstate commerce, but critics at the time and historians since have argued that the same logic could be — and was — used to criminalize nearly any effective labor action. The use of a federal injunction to jail strike leaders without a jury trial set a precedent for anti-labor injunctions that would be used against workers for decades, fundamentally tilting federal power toward capital in labor disputes.',
                    sources: [
                        { url: 'https://millercenter.org/president/cleveland/domestic-affairs', text: 'Miller Center — Grover Cleveland: Domestic Affairs and Labor Policy' },
                        { url: 'https://www.dol.gov/general/aboutdol/history/pullman', text: 'U.S. Department of Labor — The Pullman Strike and Federal Labor Policy' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Signed the Dawes Act, Stripping Native Americans of 86 Million Acres',
                    shortLabel: 'Dawes Act',
                    description: 'Cleveland signed the Dawes Severalty Act in 1887, one of the most destructive pieces of federal legislation ever directed at Native Americans. The law broke up communally held tribal lands into individual allotments assigned to tribal members, then opened the remaining "surplus" land to white settlement. The National Park Service documents how the law deliberately undermined tribal sovereignty and communal land tenure; Native Americans ultimately lost approximately 86 million acres — roughly 62 percent of their pre-1887 landholdings — through the allotment process and subsequent sales. The law also conditioned citizenship and land rights on assimilation, using property as leverage to dismantle tribal identity and governance structures.',
                    sources: [
                        { url: 'https://www.nps.gov/articles/000/dawes-act.htm', text: 'National Park Service — The Dawes Act (1887)' },
                        { url: 'https://www.archives.gov/research/native-americans/dawes/background.html', text: 'National Archives — The Dawes Act: Background and Records' }
                    ]
                },
                {
                    severity: 8,
                    title: 'Enforced Forced Assimilation of Native Americans',
                    shortLabel: 'Native Assimilation',
                    description: 'The Dawes Act was not only a land-seizure mechanism; it was the legal centerpiece of a federal policy of forced cultural assimilation designed to destroy tribal identity. Native people were pressured to abandon communal landholding, take up individual farming on fragmented allotments, and accept citizenship on federal terms that required shedding tribal affiliation. The National Archives describes the law as explicitly treating Native Americans as individuals rather than members of sovereign tribal nations — a deliberate dismantling of the legal and cultural foundations of tribal life. The allotment era produced poverty, land loss, cultural destruction, and the collapse of tribal governance that Native communities spent the following century working to reverse.',
                    sources: [
                        { url: 'https://www.archives.gov/research/native-americans/dawes/background.html', text: 'National Archives — Dawes Act and the Allotment Policy' },
                        { url: 'https://www.britannica.com/topic/Dawes-General-Allotment-Act', text: 'Britannica — Dawes General Allotment Act: Origins and Consequences' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Signed the Scott Act, Stranding Chinese Immigrants Abroad',
                    shortLabel: 'Scott Act',
                    description: 'In 1888, Cleveland signed the Scott Act, which barred Chinese laborers who had temporarily left the United States from returning — even those who held valid reentry certificates previously issued by the federal government. The law effectively voided the legal promises the U.S. had made to thousands of Chinese residents who had returned to China to visit family or conduct business in good faith reliance on those certificates. The Miller Center documents that Cleveland\'s own message to Congress made clear the bill\'s purpose was more effective exclusion of Chinese laborers. The Supreme Court upheld the Act in Chae Chan Ping v. United States, establishing the plenary power doctrine that gave Congress virtually unchecked authority over immigration.',
                    sources: [
                        { url: 'https://millercenter.org/president/cleveland/domestic-affairs', text: 'Miller Center — Cleveland and the Scott Act' },
                        { url: 'https://immigrationhistory.org/item/scott-act/', text: 'Immigration History — The Scott Act of 1888' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Mishandled the Panic of 1893 and the Resulting Depression',
                    shortLabel: 'Panic of 1893',
                    description: 'Cleveland\'s second term was consumed by the Panic of 1893, one of the worst economic depressions in American history to that point, with unemployment reaching an estimated 18 percent. Cleveland\'s response focused almost entirely on defending the gold standard and stabilizing Treasury reserves rather than addressing the suffering of workers, farmers, and the unemployed. His ideological opposition to direct federal relief left millions without meaningful assistance while he concentrated federal resources on maintaining the monetary system. Farmers and debtors, who had pushed for silver coinage to ease tight credit, felt particularly abandoned by a president who seemed more concerned with Wall Street\'s confidence than rural hardship.',
                    sources: [
                        { url: 'https://www.newyorkfed.org/medialibrary/media/research/epr/01v07n2/0111mcna.pdf', text: 'Federal Reserve Bank of New York — The Panic of 1893' },
                        { url: 'https://millercenter.org/president/cleveland/key-events', text: 'Miller Center — Grover Cleveland: The Panic of 1893' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Arranged Secretive Bond Deal with J.P. Morgan During the Depression',
                    shortLabel: 'Morgan Bond Deal',
                    description: 'To replenish the Treasury\'s dwindling gold reserves during the Panic of 1893, Cleveland\'s administration arranged a private bond sale with a syndicate led by financiers J.P. Morgan and August Belmont, borrowing $65 million in gold on terms that allowed the bankers to profit handsomely from the transaction. The deal stabilized the gold reserve but was negotiated in secrecy, bypassing Congress, and created the damaging — and largely accurate — political perception that Cleveland\'s administration was more responsive to the interests of Wall Street banking syndicates than to the millions of ordinary Americans experiencing unemployment, foreclosure, and poverty during the same crisis.',
                    sources: [
                        { url: 'https://www.newyorkfed.org/medialibrary/media/research/epr/01v07n2/0111mcna.pdf', text: 'Federal Reserve Bank of New York — The Panic of 1893 and the Morgan Bond Deal' },
                        { url: 'https://millercenter.org/president/cleveland/key-events', text: 'Miller Center — Cleveland, Morgan, and the Gold Reserve Crisis' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Opposed Federal Relief for Americans During Severe Economic Depression',
                    shortLabel: 'Denied Depression Relief',
                    description: 'During the severe depression of the 1890s, with unemployment reaching near-record levels and poverty widespread, Cleveland refused to support direct federal relief for suffering Americans, grounding his opposition in a limited-government philosophy that he believed precluded the federal government from providing charity. He famously vetoed a modest bill to provide seed grain to drought-stricken Texas farmers, writing that "though the people support the Government, the Government should not support the people." While constitutionally principled by the standards of his era, the posture left his administration with no meaningful answer to mass economic suffering and reinforced the perception that federal power would be deployed against workers but not for them.',
                    sources: [
                        { url: 'https://millercenter.org/president/cleveland/domestic-affairs', text: 'Miller Center — Cleveland\'s Opposition to Federal Relief' },
                        { url: 'https://www.presidency.ucsb.edu/documents/veto-message-219', text: 'American Presidency Project — Cleveland\'s Veto of Texas Seed Relief Bill (1887)' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Failed to Restore Hawaiian Sovereignty After U.S.-Backed Overthrow',
                    shortLabel: 'Hawaii Sovereignty',
                    description: 'When a group of American business interests and U.S. Marines backed the overthrow of Queen Liliuokalani of Hawaii in 1893, Cleveland — to his credit — refused to proceed with immediate annexation and ordered an investigation that concluded the overthrow had been illegal and that U.S. officials had improperly assisted it. He attempted to restore the queen to her throne but failed to secure congressional cooperation, and ultimately referred the matter to Congress without resolution. Hawaii was not annexed until 1898 under McKinley. Cleveland\'s partial opposition to the coup is a relative credit, but his failure to achieve any meaningful remedy left the illegal overthrow standing and Hawaiian sovereignty permanently extinguished.',
                    sources: [
                        { url: 'https://history.state.gov/milestones/1866-1898/hawaii', text: 'U.S. State Department Office of the Historian — Overthrow of the Hawaiian Kingdom' },
                        { url: 'https://www.archives.gov/exhibits/featured-documents/hawaii-annexation', text: 'National Archives — Hawaiian Annexation Documents' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Limited Civil Rights Leadership Amid Expanding Jim Crow',
                    shortLabel: 'Civil Rights Inaction',
                    description: 'Cleveland\'s presidency coincided with the rapid consolidation of Jim Crow across the South — the spread of disfranchisement, legal segregation, and racial terror including a epidemic of lynching. He did not create these systems, but he took no meaningful action to challenge them and actively signed major exclusionary laws targeting other minority groups, including the Scott Act against Chinese immigrants and the Dawes Act against Native Americans. His limited-government philosophy, combined with his dependence on Southern Democratic support, produced a presidency that offered no federal protection to Black Americans facing systematic violence and legal subjugation during one of the most dangerous periods in post-Reconstruction history.',
                    sources: [
                        { url: 'https://millercenter.org/president/cleveland/domestic-affairs', text: 'Miller Center — Grover Cleveland: Civil Rights and Race' },
                        { url: 'https://www.naacp.org/naacp-history-jim-crow-laws/', text: 'NAACP — Jim Crow Laws and the Failure of Federal Protection' }
                    ]
                },
            ]
        },
        hayes: {
            id: 'hayes',
            firstName: 'Rutherford B.',
            lastName: 'Hayes',
            ordinal: 19,
            party: 'republican',
            portrait: '/assets/images/hayes.webp',
            bars: [
                {
                    severity: 10,
                    title: 'Ended Reconstruction by Withdrawing Federal Troops from the South',
                    shortLabel: 'Ended Reconstruction',
                    description: 'In April 1877, Hayes withdrew the last remaining federal troops from South Carolina and Louisiana, effectively ending Reconstruction and the federal government\'s commitment to protecting the rights of Black Americans in the postwar South. The Hayes Presidential Library identifies this withdrawal as the moment most historians mark as the end of Reconstruction, because those troops had been the last protection sustaining Republican state governments and Black civil rights against violent white-supremacist resistance. What followed was swift and devastating: Southern white Democrats retook control of state governments, Black voters were systematically disfranchised through violence and legal manipulation, and the brief constitutional promise of Black citizenship and political equality was extinguished for nearly a century.',
                    sources: [
                        { url: 'https://www.rbhayes.org/research/hayes-and-reconstruction/', text: 'Rutherford B. Hayes Presidential Library — Hayes and the End of Reconstruction' },
                        { url: 'https://www.nps.gov/subjects/reconstruction/end-of-reconstruction.htm', text: 'National Park Service — The End of Reconstruction' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Gained the Presidency Through the Compromise of 1877',
                    shortLabel: 'Compromise of 1877',
                    description: 'Hayes lost the popular vote to Democrat Samuel Tilden in 1876 and the election was thrown into crisis by disputed electoral votes in Florida, Louisiana, and South Carolina. An Electoral Commission awarded Hayes the presidency along partisan lines, and the resolution was accompanied by an informal political settlement in which Republicans agreed to end military protection of Reconstruction governments in the South. History.com documents the consequence: all three disputed states quickly fell to white Democrats, and Reconstruction collapsed. Hayes\'s presidency was therefore inaugurated on a transaction in which Black Americans\' constitutional rights were traded for Democratic acquiescence to a Republican White House — a bargain whose costs were borne entirely by the most vulnerable.',
                    sources: [
                        { url: 'https://www.history.com/topics/us-politics/compromise-of-1877', text: 'History.com — The Compromise of 1877' },
                        { url: 'https://www.archives.gov/legislative/features/compromise-1877', text: 'National Archives — The Compromise of 1877' }
                    ]
                },
                {
                    severity: 10,
                    title: 'Abandoned Federal Protection of Black Civil Rights in the South',
                    shortLabel: 'Abandoned Black Rights',
                    description: 'The moral core of Hayes\'s historical failure is not the troop withdrawal as a logistical act but the deliberate abandonment of the federal government\'s constitutional obligation to protect Black citizens\' rights under the Fourteenth and Fifteenth Amendments. His "home rule" policy returned authority over Southern governance to the same white Democratic power structures that had fought a war to preserve slavery and spent Reconstruction using terror and fraud to reassert racial dominance. Hayes sometimes spoke sympathetically about Black education and fair treatment, but his actual governing priority was sectional reconciliation with white Southern elites — a reconciliation purchased at the cost of a generation of Black political rights, physical safety, and economic opportunity.',
                    sources: [
                        { url: 'https://www.loc.gov/exhibits/creating-the-united-states/reconstruction.html', text: 'Library of Congress — The Collapse of Reconstruction' },
                        { url: 'https://www.nps.gov/subjects/reconstruction/end-of-reconstruction.htm', text: 'National Park Service — Reconstruction\'s End and the Rise of Jim Crow' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Sent Federal Troops to Break the Great Railroad Strike of 1877',
                    shortLabel: 'Railroad Strike',
                    description: 'The Great Railroad Strike of 1877 began in West Virginia after railroad companies cut wages for the second time in a year and spread rapidly across multiple states in the first major national labor uprising in American history. Hayes issued proclamations and deployed federal troops to West Virginia, Maryland, Pennsylvania, and other states to restore rail operations and suppress the strike. The Library of Congress documents the federal troop deployments across multiple states. While Hayes framed the intervention as protecting mail delivery and interstate commerce rather than taking sides in a labor dispute, the practical effect was that federal military force was used to break a workers\' strike on behalf of railroad corporations — establishing a template that would be repeated for decades.',
                    sources: [
                        { url: 'https://www.loc.gov/collections/railroad-maps-1828-to-1900/articles-and-essays/history-of-railroads-and-maps/great-railroad-strike-of-1877/', text: 'Library of Congress — The Great Railroad Strike of 1877' },
                        { url: 'https://www.dol.gov/general/aboutdol/history/chapter1', text: 'U.S. Department of Labor — History of the Labor Movement: The 1877 Strike' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Established Federal Precedent of Military Force Against Labor',
                    shortLabel: 'Anti-Labor Precedent',
                    description: 'Hayes\'s deployment of federal troops during the 1877 railroad strike was not an isolated crisis response; it set a lasting precedent for using federal military power to intervene in labor disputes in ways that consistently favored employers over workers. The argument that troops were protecting commerce rather than breaking strikes provided legal and political cover that subsequent administrations — most notably Cleveland during the Pullman Strike of 1894 — would use again. Labor historians identify the 1877 strike and Hayes\'s response as a foundational moment in the long pattern of federal power being deployed against organized workers during the Gilded Age, fundamentally shaping the terrain on which American labor organizing would struggle for the next half century.',
                    sources: [
                        { url: 'https://millercenter.org/president/hayes/domestic-affairs', text: 'Miller Center — Rutherford B. Hayes: Domestic Affairs and Labor' },
                        { url: 'https://www.epi.org/publication/history-federal-intervention-labor-disputes/', text: 'Economic Policy Institute — Federal Intervention in Labor Disputes: Historical Pattern' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Oversaw the Launch of the Carlisle Indian Boarding School System',
                    shortLabel: 'Indian Boarding Schools',
                    description: 'In 1879, during Hayes\'s presidency, Richard Henry Pratt founded the Carlisle Indian Industrial School in Pennsylvania — the first major off-reservation Native American boarding school and the model for a nationwide system that would forcibly separate Native children from their families, languages, cultures, and communities for decades. The Hayes Historical Journal documents that Carlisle began with children taken from the Rosebud and Pine Ridge agencies, with the explicit purpose of "detribalizing" them and assimilating them into white American life. The boarding school system that Carlisle pioneered — operating under the motto "Kill the Indian, Save the Man" — caused intergenerational trauma whose effects Native communities continue to reckon with today.',
                    sources: [
                        { url: 'https://www.nps.gov/articles/000/carlisle-indian-industrial-school.htm', text: 'National Park Service — Carlisle Indian Industrial School' },
                        { url: 'https://www.doi.gov/sites/doi.gov/files/report-on-federal-indian-boarding-school-initiative-investigative-report.pdf', text: 'Department of the Interior — Federal Indian Boarding School Initiative Investigative Report (2022)' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Pursued Native Assimilation Policy That Attacked Tribal Sovereignty',
                    shortLabel: 'Native Assimilation',
                    description: 'Hayes\'s approach to Native American policy centered on assimilation through individual land ownership, English-language education, and citizenship — framed as a benevolent alternative to extermination, but in practice a systematic attack on tribal sovereignty, communal land tenure, and cultural survival. His administration\'s support for policies that would culminate in the Dawes Act of 1887 treated tribal governance and Native cultural practices as obstacles to be dismantled rather than rights to be respected. The Indian Country Today quotation of a Hayes Presidential Library curator confirms the policy was explicitly aimed at shifting Native people away from tribal life and into mainstream American society on terms defined entirely by the federal government.',
                    sources: [
                        { url: 'https://www.rbhayes.org/research/hayes-and-native-americans/', text: 'Rutherford B. Hayes Presidential Library — Hayes and Native American Policy' },
                        { url: 'https://www.nps.gov/articles/000/dawes-act.htm', text: 'National Park Service — The Dawes Act and the Allotment Era' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Presidency Born from a Legitimacy Crisis Tied to Reconstruction\'s Collapse',
                    shortLabel: 'Legitimacy Crisis',
                    description: 'Hayes\'s path to the presidency was inseparable from the political settlement that ended Reconstruction. He lost the popular vote, the electoral outcome was disputed in three states, and the Electoral Commission\'s resolution fell along strict partisan lines. Whatever the constitutional legitimacy of the process, the political reality was that Hayes entered the White House as part of a settlement whose central currency was the withdrawal of federal protection for Black Americans in the South. His administration never escaped the moral weight of that origin, and his subsequent governing choices — prioritizing reconciliation with Southern Democrats over enforcement of constitutional rights — confirmed rather than repudiated the terms on which his presidency was founded.',
                    sources: [
                        { url: 'https://www.senate.gov/artandhistory/history/common/generic/ElectoralCommission.htm', text: 'U.S. Senate — The Electoral Commission of 1877' },
                        { url: 'https://millercenter.org/president/hayes/key-events', text: 'Miller Center — Rutherford B. Hayes: Key Events' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Weak Civil Rights Leadership Despite Occasional Sympathetic Rhetoric',
                    shortLabel: 'Civil Rights Failure',
                    description: 'Hayes occasionally expressed support for Black education and fair treatment in speeches and messages to Congress, and he appointed a few Black Americans to federal positions. But his actual governing priorities — civil-service reform, currency policy, and above all sectional reconciliation with white Southern Democrats — left no meaningful federal protection for Black citizens facing a rapidly consolidating system of voter suppression, legal segregation, and racial terror. The gap between Hayes\'s occasional sympathetic words and his consistent policy choices in favor of Southern "home rule" represents one of the most consequential failures of presidential moral leadership in American history, enabling the Jim Crow system that would endure for nearly a century.',
                    sources: [
                        { url: 'https://millercenter.org/president/hayes/domestic-affairs', text: 'Miller Center — Hayes: Civil Rights and Race Relations' },
                        { url: 'https://www.naacp.org/naacp-history-jim-crow-laws/', text: 'NAACP — Jim Crow\'s Origins and the Failure of Federal Protection' }
                    ]
                },
                {
                    severity: 3,
                    title: 'Paved the Road Toward Chinese Exclusion Despite Vetoing an Early Bill',
                    shortLabel: 'Chinese Exclusion Path',
                    description: 'Hayes vetoed an 1879 congressional bill restricting Chinese immigration on the grounds that it violated existing treaty obligations with China — a defensible position that was better than what followed under his successors. However, his administration then renegotiated the Burlingame Treaty with China to give Congress the authority to restrict Chinese immigration, directly enabling the Chinese Exclusion Act of 1882 under Chester Arthur. The State Department\'s historical record documents this renegotiation as a significant step in the political movement toward formal exclusion. Hayes\'s veto was a momentary check; his treaty renegotiation helped open the door that the exclusion movement walked through.',
                    sources: [
                        { url: 'https://history.state.gov/milestones/1866-1898/chinese-immigration', text: 'U.S. State Department Office of the Historian — Chinese Immigration and the Chinese Exclusion Act' },
                        { url: 'https://immigrationhistory.org/item/angell-treaty/', text: 'Immigration History — The Angell Treaty of 1880 and Chinese Exclusion' }
                    ]
                },
            ]
        },
        buchanan: {
            id: 'buchanan',
            firstName: 'James',
            lastName: 'Buchanan',
            ordinal: 15,
            party: 'democrat',
            portrait: '/assets/images/buchanan.webp',
            bars: [
                {
                    severity: 10,
                    title: 'Failed to Stop Secession as Southern States Left the Union',
                    shortLabel: 'Allowed Secession',
                    description: 'When Southern states began leaving the Union following Lincoln\'s election in November 1860, Buchanan responded with a paralyzing combination of legal positions that effectively guaranteed inaction. He declared secession unconstitutional while simultaneously arguing that the federal government had no legal authority to prevent it — a stance Britannica summarizes as denouncing secession while claiming he had no means to stop it. By February 1861, seven Southern states had seceded and formed the Confederate States of America. Buchanan handed Lincoln an active national dissolution rather than a brewing crisis, having spent the decisive months finding constitutional reasons to do nothing while the country fractured around him.',
                    sources: [
                        { url: 'https://millercenter.org/president/buchanan/domestic-affairs', text: 'Miller Center — James Buchanan: Domestic Affairs and the Secession Crisis' },
                        { url: 'https://www.britannica.com/biography/James-Buchanan/Presidency', text: 'Britannica — James Buchanan: The Presidency and Secession' }
                    ]
                },
                {
                    severity: 10,
                    title: 'Let the Union Collapse Through Paralysis and Indecision',
                    shortLabel: 'Union Collapse',
                    description: 'Buchanan was president during the decisive months when the sectional crisis over slavery became an irreversible national rupture, and he responded with a combination of weak rhetoric and genuine inaction that historians consistently identify as catastrophic. The White House\'s own historical summary describes his position as denying states the right to secede while holding that the federal government could not legally prevent them from doing so — a contradiction that paralyzed his administration at the exact moment presidential clarity and resolve were most needed. He neither defused the crisis through leadership nor confronted it through force, instead narrating the Union\'s collapse from the sidelines while waiting for his term to end.',
                    sources: [
                        { url: 'https://www.whitehouse.gov/about-the-white-house/presidents/james-buchanan/', text: 'White House — James Buchanan: Presidential Biography' },
                        { url: 'https://millercenter.org/president/buchanan/key-events', text: 'Miller Center — James Buchanan: Key Events of His Presidency' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Supported the Dred Scott Decision and Hoped It Would Settle Slavery',
                    shortLabel: 'Dred Scott Support',
                    description: 'The Supreme Court\'s 1857 Dred Scott v. Sandford decision was one of the most catastrophic judicial rulings in American history — declaring that Black people could never be U.S. citizens, that enslaved people were property, and that Congress had no constitutional authority to ban slavery in federal territories. Buchanan publicly endorsed the decision and hoped it would permanently resolve the slavery controversy in the South\'s favor. The Smithsonian documents that Buchanan referenced the forthcoming decision in his inaugural address and urged Americans to accept it — before the ruling had even been publicly released, revealing how closely he was coordinating with the Court on a decision that would inflame rather than settle the national crisis.',
                    sources: [
                        { url: 'https://www.smithsonianmag.com/history/the-dred-scott-decision-103038372/', text: 'Smithsonian Magazine — The Dred Scott Decision and Buchanan\'s Role' },
                        { url: 'https://www.archives.gov/milestone-documents/dred-scott-v-sandford', text: 'National Archives — Dred Scott v. Sandford: Milestone Documents' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Improperly Influenced the Dred Scott Decision Before It Was Issued',
                    shortLabel: 'Judicial Manipulation',
                    description: 'The criticism of Buchanan\'s relationship to Dred Scott goes beyond public endorsement. Historical evidence shows he privately corresponded with Supreme Court justices before the ruling was issued — most significantly with Justice Robert Grier — lobbying for a broader decision that would resolve the territorial slavery question definitively in favor of the South and appear to have cross-sectional rather than merely Southern support. This private presidential interference in pending Supreme Court deliberations represented a serious violation of judicial independence, and it tied Buchanan\'s administration to a ruling that inflamed the sectional crisis it was supposed to resolve. The decision became one of the most widely condemned in the Court\'s history; Buchanan had worked behind the scenes to make it worse.',
                    sources: [
                        { url: 'https://www.fjc.gov/history/cases/landmark-judicial-decisions/dred-scott-v-sandford', text: 'Federal Judicial Center — Dred Scott v. Sandford: Case History' },
                        { url: 'https://millercenter.org/president/buchanan/key-events', text: 'Miller Center — Buchanan and the Dred Scott Decision' }
                    ]
                },
                {
                    severity: 8,
                    title: 'Backed the Pro-Slavery Lecompton Constitution for Kansas',
                    shortLabel: 'Lecompton Constitution',
                    description: 'Buchanan supported admitting Kansas to the Union under the Lecompton Constitution — a pro-slavery document produced by a convention that most anti-slavery Kansas settlers had boycotted and that most Kansans opposed. The Truman Library documents the Lecompton Constitution as a pro-slavery framework that would have forced slavery onto a territory where the majority of settlers did not want it. The American Battlefield Trust identifies the Lecompton controversy as a major escalating moment in the sectional crisis. Buchanan\'s insistence on pushing Lecompton through Congress — even as Stephen Douglas and many Northern Democrats broke with him over it — revealed that his administration would subordinate democratic process to pro-slavery political outcomes.',
                    sources: [
                        { url: 'https://www.battlefields.org/learn/articles/lecompton-constitution', text: 'American Battlefield Trust — The Lecompton Constitution' },
                        { url: 'https://www.trumanlibrary.gov/education/presidential-inquiries/kansas-nebraska-act-and-lecompton-constitution', text: 'Truman Presidential Library — The Lecompton Constitution and Kansas' }
                    ]
                },
                {
                    severity: 8,
                    title: 'Betrayed Popular Sovereignty in Kansas to Force a Pro-Slavery Outcome',
                    shortLabel: 'Popular Sovereignty Betrayal',
                    description: 'The Democratic Party had promoted "popular sovereignty" — the principle that settlers in a territory would democratically decide whether to permit slavery — as a moderate solution to the sectional crisis. In Kansas, Buchanan discarded that principle the moment its application threatened a pro-slavery result. Anti-slavery settlers in Kansas had boycotted the Lecompton convention, rejected its constitution in a subsequent referendum, and made their preferences clear. Buchanan backed Lecompton anyway, making obvious that his commitment to popular sovereignty was conditional on it producing the outcome the Southern wing of his party demanded. The betrayal split the Democratic Party, alienated Stephen Douglas, and demonstrated that his administration\'s deepest loyalty was to Southern slaveholders rather than democratic process.',
                    sources: [
                        { url: 'https://millercenter.org/president/buchanan/domestic-affairs', text: 'Miller Center — Buchanan, Kansas, and Popular Sovereignty' },
                        { url: 'https://www.battlefields.org/learn/articles/lecompton-constitution', text: 'American Battlefield Trust — Popular Sovereignty and the Lecompton Controversy' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Blamed Northern Antislavery Agitation Rather Than Southern Secessionists',
                    shortLabel: 'Blamed the North',
                    description: 'In his December 1860 message to Congress — delivered as Southern states were actively leaving the Union — Buchanan declared secession unconstitutional but attributed the crisis primarily to "the long-continued and intemperate interference of the Northern people with the question of slavery." The Miller Center documents this framing as a fundamental misreading of the moral and political reality: Southern states were seceding explicitly to protect and expand slavery, had said so clearly in their own secession declarations, and had spent years using federal power to enforce the Fugitive Slave Act on Northern states. Buchanan\'s message, at the gravest moment of national crisis, offered moral equivalence between those defending human bondage and those opposing it.',
                    sources: [
                        { url: 'https://millercenter.org/president/buchanan/key-events', text: 'Miller Center — Buchanan\'s December 1860 Message to Congress' },
                        { url: 'https://www.presidency.ucsb.edu/documents/fourth-annual-message-congress-state-the-union-0', text: 'American Presidency Project — Buchanan\'s Fourth Annual Message to Congress (Dec. 1860)' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Split the Democratic Party and Cleared the Path for Lincoln\'s Election',
                    shortLabel: 'Split Democratic Party',
                    description: 'By backing the Lecompton Constitution over the objections of Stephen Douglas and Northern Democrats, Buchanan created a fracture in the Democratic Party that proved fatal in the 1860 election. When the party could not unite behind a single candidate — Northern Democrats running Douglas, Southern Democrats running John Breckinridge — the Republican Abraham Lincoln won with a purely regional coalition and without a single electoral vote from the Deep South. The American Battlefield Trust documents that Buchanan\'s actions and inactions aggravated sectional tensions to the point of national dissolution. His systematic prioritization of Southern pro-slavery interests over party unity handed Republicans the presidency and Southern fire-eaters the pretext for secession.',
                    sources: [
                        { url: 'https://www.battlefields.org/learn/articles/election-1860', text: 'American Battlefield Trust — The Election of 1860' },
                        { url: 'https://millercenter.org/president/buchanan/domestic-affairs', text: 'Miller Center — Buchanan and the Fracturing of the Democratic Party' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Botched the Fort Sumter Crisis and Left Lincoln a Military Emergency',
                    shortLabel: 'Fort Sumter Failure',
                    description: 'As Confederate forces surrounded Fort Sumter in Charleston Harbor, Buchanan initially did nothing — then, after weeks of hesitation, attempted to resupply and reinforce the garrison by sending the merchant vessel Star of the West in January 1861. Confederate shore batteries fired on the ship and drove it away. The mission failed, the garrison remained besieged, and Buchanan took no further action. He handed Lincoln not a brewing diplomatic problem but an active military standoff with no good options. The Star of the West incident was in some ways the first military engagement of the Civil War, fought on Buchanan\'s watch and resolved in the Confederacy\'s favor because his administration had waited too long to act with adequate force.',
                    sources: [
                        { url: 'https://www.battlefields.org/learn/articles/star-of-the-west', text: 'American Battlefield Trust — The Star of the West Incident (Jan. 1861)' },
                        { url: 'https://www.nps.gov/fosu/learn/historyculture/star-of-the-west.htm', text: 'National Park Service — Fort Sumter: The Star of the West' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Cabinet Disloyal to the Union During the Secession Crisis',
                    shortLabel: 'Disloyal Cabinet',
                    description: 'As secession unfolded, Buchanan\'s cabinet included Southern sympathizers who were actively working against Union interests — Secretary of War John Floyd transferred weapons to Southern arsenals before resigning to join the Confederacy, and Treasury Secretary Howell Cobb left to become a Confederate general. Buchanan eventually replaced the most compromised members with stronger Unionists, but only after the damage had been done. The administrative incoherence of a cabinet partly loyal to the secessionist cause and partly to the Union reflected and reinforced the paralysis that defined his final months in office, leaving the federal government\'s response to secession fragmented and ineffective at the moment it most needed to be unified.',
                    sources: [
                        { url: 'https://millercenter.org/president/buchanan/key-events', text: 'Miller Center — Buchanan\'s Cabinet and the Secession Crisis' },
                        { url: 'https://www.britannica.com/biography/James-Buchanan/Presidency', text: 'Britannica — Buchanan\'s Cabinet Disloyalty During Secession' }
                    ]
                },
            ]
        },
        harding: {
            id: 'harding',
            firstName: 'Warren G.',
            lastName: 'Harding',
            ordinal: 29,
            party: 'republican',
            portrait: '/assets/images/harding.webp',
            bars: [
                {
                    severity: 9,
                    title: 'Teapot Dome: The Defining Corruption Scandal of His Administration',
                    shortLabel: 'Teapot Dome',
                    description: 'The Teapot Dome scandal became the most notorious symbol of government corruption in American history up to that point. Harding\'s Interior Secretary Albert B. Fall secretly leased federally owned naval oil reserves at Teapot Dome, Wyoming and Elk Hills, California to private oil companies in exchange for cash bribes and no-interest loans. The U.S. Senate documents that Fall became the first former Cabinet official in American history to be imprisoned for crimes committed while in office. Harding was not personally shown to have profited, but the scandal unfolded entirely within his administration, involving a Cabinet member he had personally chosen and trusted with the federal assets Fall proceeded to loot.',
                    sources: [
                        { url: 'https://www.senate.gov/artandhistory/history/common/investigations/TeapotDome.htm', text: 'U.S. Senate — Teapot Dome Scandal: Historical Overview' },
                        { url: 'https://www.archives.gov/education/lessons/teapot-dome', text: 'National Archives — Teapot Dome: Primary Documents in American History' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Transferred Naval Oil Reserves to Interior Department, Enabling the Scandal',
                    shortLabel: 'Oil Reserve Transfer',
                    description: 'Before the Teapot Dome scandal fully unfolded, Harding signed Executive Order 3474 on May 21, 1921, transferring control of the strategic naval petroleum reserves from the Navy Department — where they had been held for national security purposes — to the Interior Department under Albert Fall. The Levin Center documents this transfer as the administrative move that gave Fall the authority he needed to lease the reserves corruptly to private oil interests. Whether Harding understood what he was enabling or simply trusted Fall without scrutiny, the executive order was the mechanism that made the scandal possible, and he signed it.',
                    sources: [
                        { url: 'https://levin.senate.gov/imo/media/doc/supporting/2012/PSI_OilContractReports_022712.pdf', text: 'Levin Center — Executive Order 3474 and the Naval Oil Reserve Transfer' },
                        { url: 'https://www.senate.gov/artandhistory/history/common/investigations/TeapotDome.htm', text: 'U.S. Senate — Teapot Dome: The Oil Reserve Transfer' }
                    ]
                },
                {
                    severity: 8,
                    title: 'Filled His Administration with the Corrupt "Ohio Gang"',
                    shortLabel: 'Ohio Gang',
                    description: 'Harding staffed his administration with a network of political associates and personal friends from Ohio — known collectively as the "Ohio Gang" — many of whom used their government positions for personal enrichment and fraud. The Miller Center documents that multiple Ohio Gang figures were later charged with defrauding the government, with several imprisoned. Britannica similarly describes the group as betraying the public trust through a series of interlocking scandals. Harding had capable Cabinet members — Hughes, Mellon, and Hoover among them — which makes the Ohio Gang appointments all the more damning as a failure of judgment: he knew what competent, ethical governance looked like and still handed critical positions to men who looted the offices he gave them.',
                    sources: [
                        { url: 'https://millercenter.org/president/harding/domestic-affairs', text: 'Miller Center — Warren Harding: The Ohio Gang and Administration Corruption' },
                        { url: 'https://www.britannica.com/biography/Warren-G-Harding/Administration-and-scandals', text: 'Britannica — Warren G. Harding: Administration Scandals and the Ohio Gang' }
                    ]
                },
                {
                    severity: 8,
                    title: 'Veterans Bureau Director Looted Funds Meant for World War I Veterans',
                    shortLabel: 'Veterans Bureau Fraud',
                    description: 'Charles R. Forbes, whom Harding personally appointed to lead the newly created Veterans Bureau, systematically looted the agency through corrupt contracts for veterans\' hospital construction and supply procurement — stealing funds appropriated by Congress to care for World War I veterans. Britannica documents that Forbes was subsequently convicted of fraud, conspiracy, and bribery. The Veterans Bureau scandal was in many ways morally worse than Teapot Dome: it involved the deliberate theft of resources designated for soldiers who had been wounded or sickened in service to their country. Harding reportedly confronted Forbes personally when rumors reached him, but allowed him to resign and flee to Europe rather than immediately exposing and prosecuting him.',
                    sources: [
                        { url: 'https://www.britannica.com/biography/Warren-G-Harding/Administration-and-scandals', text: 'Britannica — Charles Forbes and the Veterans Bureau Scandal' },
                        { url: 'https://www.va.gov/opa/publications/celebrate/vetsbureau.pdf', text: 'U.S. Department of Veterans Affairs — History of the Veterans Bureau' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Knew About Corruption but Failed to Expose It',
                    shortLabel: 'Concealed Corruption',
                    description: 'The most damning personal charge against Harding is not that he was corrupt himself but that he became aware of serious corruption within his administration and failed to confront it decisively or publicly. Britannica states plainly that while Harding was not personally implicated in Teapot Dome or the other major scandals, he was aware of corrupt behavior by Ohio Gang associates and chose not to expose it. He reportedly told associates in the final months of his life that betrayal by his friends was destroying him — suggesting he understood the scale of what was happening while still prioritizing personal loyalty over public duty. That choice to protect corrupt friends rather than the public interest is a fundamental failure of the presidency.',
                    sources: [
                        { url: 'https://www.britannica.com/biography/Warren-G-Harding/Administration-and-scandals', text: 'Britannica — Harding\'s Awareness of Administration Corruption' },
                        { url: 'https://millercenter.org/president/harding/key-events', text: 'Miller Center — Warren Harding: Key Events and the Corruption Crisis' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Appointed Harry Daugherty as Attorney General',
                    shortLabel: 'Daugherty Appointment',
                    description: 'Harding appointed Harry Daugherty — the Ohio Gang\'s central political operative and the man most responsible for engineering Harding\'s own nomination — as Attorney General of the United States, placing the nation\'s chief law enforcement officer in the hands of a figure deeply embedded in the corrupt network that would define his administration. Daugherty was investigated after Harding\'s death, resigned under pressure during the Coolidge administration, and faced two criminal trials before ultimately escaping conviction on a hung jury. Britannica identifies Daugherty as the Ohio Gang\'s leader. Placing such a figure atop the Justice Department — the institution responsible for prosecuting federal corruption — was a failure of judgment with systemic consequences for the rule of law.',
                    sources: [
                        { url: 'https://www.britannica.com/biography/Harry-M-Daugherty', text: 'Britannica — Harry M. Daugherty: Attorney General and Ohio Gang' },
                        { url: 'https://millercenter.org/president/harding/domestic-affairs', text: 'Miller Center — Harding\'s Cabinet Appointments and Daugherty' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Signed the Emergency Quota Act, Embedding Eugenic Immigration Restriction',
                    shortLabel: 'Immigration Quota Act',
                    description: 'Harding signed the Emergency Quota Act of 1921, which introduced national-origin quotas to sharply restrict immigration for the first time in American history. Immigration History documents that the quotas were designed using eugenic research and restrictionist recommendations, structured to heavily favor immigrants from Northern and Western Europe while drastically limiting arrivals from Southern and Eastern Europe — Jews, Italians, Poles, Greeks, and others deemed racially inferior by the eugenicist thinking that undergirded the law. The Act was framed as temporary but established the quota framework that the far harsher Johnson-Reed Act of 1924 would make permanent, reshaping the ethnic composition of American immigration for four decades.',
                    sources: [
                        { url: 'https://immigrationhistory.org/item/emergency-quota-act/', text: 'Immigration History — The Emergency Quota Act of 1921' },
                        { url: 'https://history.state.gov/milestones/1921-1936/immigration-act', text: 'U.S. State Department Office of the Historian — The Immigration Act of 1921' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Used Sweeping Injunction to Crush the 1922 Railroad Strike',
                    shortLabel: '1922 Railroad Strike',
                    description: 'When railroad shopmen walked out in July 1922 over wage cuts imposed by the Railroad Labor Board, Harding\'s administration initially attempted mediation but ultimately backed a legal assault on the strike. Attorney General Daugherty obtained one of the most sweeping federal injunctions in American labor history, prohibiting striking, picketing, strike fund payments, and virtually any other form of union support activity. Critics condemned the injunction as an abuse of judicial power in service of the railroads, and labor organizations saw it as the federal government once again using its legal machinery to destroy worker organizing rather than protect workers\' rights to bargain collectively.',
                    sources: [
                        { url: 'https://www.dol.gov/general/aboutdol/history/chapter2', text: 'U.S. Department of Labor — The 1922 Railroad Strike and Federal Response' },
                        { url: 'https://millercenter.org/president/harding/domestic-affairs', text: 'Miller Center — Harding and the 1922 Railroad and Coal Strikes' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Vetoed the World War I Veterans\' Bonus Bill',
                    shortLabel: 'Veterans Bonus Veto',
                    description: 'In 1922, Harding vetoed a bill to provide adjusted compensation — commonly called a "bonus" — to World War I veterans who had served at military pay rates far below what civilian war-industry workers had earned during the same period. The House historical record documents the veto; the Miller Center notes Harding argued that balancing the federal budget took priority over the debt owed to veterans. The fiscal argument was not irrational given postwar debt levels, but the veto landed badly alongside the simultaneous corruption of the Veterans Bureau under Forbes — creating the damaging appearance that Harding\'s administration would steal from veterans through Forbes while refusing to compensate them through Congress.',
                    sources: [
                        { url: 'https://history.house.gov/Historical-Highlights/1901-1950/The-Bonus-Bill/', text: 'U.S. House of Representatives — The Veterans\' Bonus Bill' },
                        { url: 'https://millercenter.org/president/harding/domestic-affairs', text: 'Miller Center — Harding\'s Veto of the Veterans\' Bonus' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Lax Presidential Management Allowed Corruption to Flourish',
                    shortLabel: 'Management Failure',
                    description: 'Harding\'s administration included genuinely capable figures — Secretary of State Charles Evans Hughes, Treasury Secretary Andrew Mellon, and Commerce Secretary Herbert Hoover were all serious and effective — which makes his management failures elsewhere all the more striking as a matter of deliberate choice. The Miller Center documents that Harding admitted to close friends that the job was beyond him. His governing style was built on personal loyalty and a deep aversion to confrontation, which meant that when associates abused their positions, Harding\'s instinct was to look away rather than act. That temperamental unfitness for the disciplined, skeptical oversight the presidency required allowed the Ohio Gang\'s corruption to metastasize throughout his administration unchecked.',
                    sources: [
                        { url: 'https://millercenter.org/president/harding/domestic-affairs', text: 'Miller Center — Harding\'s Presidential Management Style' },
                        { url: 'https://www.britannica.com/biography/Warren-G-Harding/Presidency', text: 'Britannica — Warren G. Harding: Presidential Leadership and Its Failures' }
                    ]
                },
            ]
        },
        fillmore: {
            id: 'fillmore',
            firstName: 'Millard',
            lastName: 'Fillmore',
            ordinal: 13,
            party: 'whig',
            portrait: '/assets/images/fillmore.webp',
            bars: [
                {
                    severity: 10,
                    title: 'Signed the Fugitive Slave Act of 1850',
                    shortLabel: 'Fugitive Slave Act',
                    description: 'Fillmore\'s most consequential and morally damning act was signing the Fugitive Slave Act of 1850, which required federal officials and ordinary citizens in free states to actively assist in the capture and return of escaped enslaved people, imposing criminal penalties on anyone who aided or harbored a freedom-seeker. The White House Historical Association documents that abolitionists heavily criticized the signing because it forced the federal government to become the enforcement arm of slave owners pursuing people who had escaped bondage. The Act was not a passive accommodation of slavery in the states where it existed — it was a federal mandate that the machinery of free states be turned against freedom itself, transforming every Northern community into potential territory for slave-catching operations.',
                    sources: [
                        { url: 'https://www.whitehousehistory.org/bios/millard-fillmore', text: 'White House Historical Association — Millard Fillmore: Presidential Biography' },
                        { url: 'https://www.archives.gov/milestone-documents/fugitive-slave-act', text: 'National Archives — Fugitive Slave Act of 1850: Milestone Documents' }
                    ]
                },
                {
                    severity: 10,
                    title: 'Nationalized Slavery Enforcement Into Free States',
                    shortLabel: 'Slavery Nationalized',
                    description: 'The Fugitive Slave Act did not merely affect Southern states — it deliberately extended slavery\'s reach into the free North by legally compelling Northern officials, judges, and citizens to participate in the capture and return of escaped enslaved people. Citizens who refused to assist slave-catchers or who helped freedom-seekers could be fined or imprisoned. East Carolina University\'s summary of the Act documents that it gave slave owners "immense powers" to pursue escaped people across state lines with federal backing. The result was that communities in Massachusetts, Ohio, Pennsylvania, and New York — states that had legally abolished slavery — were conscripted into its enforcement. The Act radicalized Northern public opinion, fueled the abolitionist movement, and made the moral reality of slavery impossible to ignore for people who had previously felt insulated from it.',
                    sources: [
                        { url: 'https://www.archives.gov/milestone-documents/fugitive-slave-act', text: 'National Archives — Fugitive Slave Act: Text and Historical Context' },
                        { url: 'https://www.loc.gov/resource/rbpe.14000400/', text: 'Library of Congress — Fugitive Slave Act of 1850: Primary Source Materials' }
                    ]
                },
                {
                    severity: 8,
                    title: 'Backed the Compromise of 1850 as a "Final Settlement" That Settled Nothing',
                    shortLabel: 'Compromise of 1850',
                    description: 'Fillmore championed the Compromise of 1850 as a permanent resolution to the sectional crisis over slavery, believing he had averted disunion through statesmanship. The White House\'s own historical biography acknowledges that the compromise produced only an "uneasy sectional truce" rather than a genuine settlement. While the Compromise included provisions that appeared balanced — California entered as a free state, the slave trade was ended in Washington D.C. — the Fugitive Slave Act was so explosive that it overwhelmed any goodwill the other provisions generated. Rather than quieting the slavery debate, the Compromise deepened it by forcing the moral question of slavery into Northern communities that had previously kept it at arm\'s length, accelerating the polarization that ended in secession eleven years later.',
                    sources: [
                        { url: 'https://www.whitehouse.gov/about-the-white-house/presidents/millard-fillmore/', text: 'White House — Millard Fillmore: Presidential Biography' },
                        { url: 'https://millercenter.org/president/fillmore/domestic-affairs', text: 'Miller Center — Millard Fillmore: The Compromise of 1850' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Prioritized Legal Order Over Human Freedom on Slavery',
                    shortLabel: 'Order Over Freedom',
                    description: 'Fillmore\'s defenders have long argued that he saw himself as a constitutional officer bound to enforce lawfully enacted legislation, and that the alternative — presidents selectively enforcing laws they agreed with — would have been worse for the rule of law. The problem with that defense is that the law he chose to enforce with particular vigor was one requiring the return of human beings to chattel slavery. Fillmore used federal marshals and troops to enforce the Fugitive Slave Act in high-profile cases that became national flashpoints, signaling to the South that the federal government would be an active partner in slave-catching. His prioritization of legal order and Southern political appeasement over the freedom and humanity of escaped enslaved people is the central moral failure of his presidency.',
                    sources: [
                        { url: 'https://millercenter.org/president/fillmore/domestic-affairs', text: 'Miller Center — Fillmore and the Enforcement of the Fugitive Slave Act' },
                        { url: 'https://www.britannica.com/biography/Millard-Fillmore/Presidency', text: 'Britannica — Millard Fillmore: The Presidency and the Slavery Question' }
                    ]
                },
                {
                    severity: 8,
                    title: 'Worsened Sectional Polarization He Intended to Heal',
                    shortLabel: 'Deepened Sectional Crisis',
                    description: 'Fillmore signed the Fugitive Slave Act explicitly to calm sectional tensions, but the practical effect was the opposite. The Act galvanized the abolitionist movement, produced dramatic public confrontations when slave-catchers attempted to seize freedom-seekers in Northern cities, inspired Harriet Beecher Stowe to write Uncle Tom\'s Cabin, and drove a wedge through the Whig Party that contributed to its collapse. The archived White House biography documents that Northern Whigs refused to forgive Fillmore for signing the Act and helped deny him his own party\'s 1852 presidential nomination. His attempt to appease the South accelerated the very polarization he sought to prevent, demonstrating that federal complicity in slavery\'s expansion could not purchase durable peace.',
                    sources: [
                        { url: 'https://millercenter.org/president/fillmore/key-events', text: 'Miller Center — Fillmore: Consequences of the Fugitive Slave Act' },
                        { url: 'https://www.britannica.com/biography/Millard-Fillmore/Presidency', text: 'Britannica — Fillmore and the Collapse of the Whig Party' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Failed to Secure Treaty Protections for California Native Nations',
                    shortLabel: 'California Native Treaties',
                    description: 'During Fillmore\'s presidency, federal commissioners negotiated eighteen treaties with California Native nations that promised land reservations and protections in exchange for ceding vast territories. The Senate never ratified the treaties, and the Fillmore administration allowed them to be sealed from public view for decades — meaning California Native peoples had ceded their land claims without receiving the promised protections in return, while being legally barred from knowing the treaty terms. The California State University Monterey Bay archive documents the eighteen unratified treaties; the Smithsonian notes individual treaties among them. The failure to secure ratification left California Native communities without federal land protection during the period of most intense settler violence and dispossession following the Gold Rush.',
                    sources: [
                        { url: 'https://scholarworks.calstate.edu/concern/publications/h702q636s', text: 'California State University Monterey Bay — The 18 Unratified California Treaties' },
                        { url: 'https://americanindian.si.edu/nk360/california-gold-rush/treaties.cshtml', text: 'Smithsonian National Museum of the American Indian — California Treaties and the Gold Rush Era' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Governed During the Decimation of California Native Communities',
                    shortLabel: 'California Native Violence',
                    description: 'Fillmore\'s presidency coincided with the most catastrophic period of violence against California Native peoples following the Gold Rush, as settler encroachment, state-sanctioned militia campaigns, and federal inaction combined to devastate Native communities across the state. California historians have documented the era as a genocide; the state\'s own Native population collapsed from an estimated 150,000 at the time of the Gold Rush to fewer than 30,000 by 1870. Fillmore did not personally order the violence, but his administration governed during the critical window when federal intervention and ratified land treaties could have provided some protection, and it provided neither. The failure to ratify the eighteen negotiated treaties removed the primary legal mechanism that might have buffered Native communities against the worst excesses of settler expansion.',
                    sources: [
                        { url: 'https://www.nps.gov/articles/california-indian-history.htm', text: 'National Park Service — California Indian History and the Gold Rush Era' },
                        { url: 'https://www.britannica.com/topic/California-Indian', text: 'Britannica — California Indians: History and the Impact of the Gold Rush' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Authorized Perry\'s Coercive Naval Expedition to Japan',
                    shortLabel: 'Perry Japan Expedition',
                    description: 'Fillmore authorized the naval expedition that became Commodore Matthew Perry\'s 1853 mission to Japan, in which Perry arrived with a squadron of heavily armed steam-powered warships — the "Black Ships" — and demanded that Japan open its ports to American trade and diplomatic relations under an implicit threat of force. The State Department documents that Fillmore authorized the formal naval expedition in 1851. The mission is frequently celebrated as a diplomatic achievement that opened Japan to the modern world, but it was a textbook exercise in coercive gunboat diplomacy: a militarily superior power using the threat of destruction to compel a weaker nation to abandon its own sovereign policy choices. Japan\'s subsequent internal upheaval following forced opening contributed to decades of political instability.',
                    sources: [
                        { url: 'https://history.state.gov/milestones/1830-1860/opening-to-japan', text: 'U.S. State Department Office of the Historian — Opening to Japan: The Perry Mission' },
                        { url: 'https://www.britannica.com/event/Convention-of-Kanagawa', text: 'Britannica — Commodore Perry and the Opening of Japan' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Helped Destroy the Whig Party\'s Anti-Slavery Credibility',
                    shortLabel: 'Whig Party Collapse',
                    description: 'Fillmore\'s embrace of the Fugitive Slave Act and the Compromise of 1850 exposed an irreconcilable fault line within the Whig Party between its Northern anti-slavery wing and its Southern slaveholder wing. Northern Whigs — including many who became the core of the emerging Republican Party — refused to forgive Fillmore for signing the Act, denying him the 1852 Whig nomination despite his incumbency. The Whig Party never won another presidential election and effectively ceased to exist within a few years. Fillmore\'s presidency did not alone cause the Whig collapse — the party faced structural tensions the slavery issue made permanent — but his signature decisions accelerated the dissolution of the last political organization that had attempted to hold the sectional divide together.',
                    sources: [
                        { url: 'https://millercenter.org/president/fillmore/key-events', text: 'Miller Center — The Collapse of the Whig Party Under Fillmore' },
                        { url: 'https://www.britannica.com/topic/Whig-Party-United-States', text: 'Britannica — Whig Party: Dissolution and the Slavery Crisis' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Ran for President in 1856 on the Know-Nothing Ticket',
                    shortLabel: 'Know-Nothing Campaign',
                    description: 'After leaving office, Fillmore accepted the 1856 presidential nomination of the American Party — widely known as the Know-Nothings — a nativist movement built on anti-Catholic and anti-immigrant sentiment that portrayed Catholic immigrants, particularly Irish and German arrivals, as agents of papal conspiracy incompatible with American democracy. Fillmore did not personally embrace the movement\'s most extreme rhetoric, but his willingness to run on its platform lent his presidential credibility to a movement rooted in religious bigotry and ethnic hatred at a moment when the country needed leadership that could address the slavery crisis. He finished third, carrying only Maryland, but the candidacy remains a significant stain on his post-presidential record.',
                    sources: [
                        { url: 'https://millercenter.org/president/fillmore/key-events', text: 'Miller Center — Fillmore and the Know-Nothing Party (1856)' },
                        { url: 'https://www.britannica.com/topic/Know-Nothing-movement', text: 'Britannica — Know-Nothing Movement: Origins and the 1856 Election' }
                    ]
                },
            ]
        },
        washington: {
            id: 'washington',
            firstName: 'George',
            lastName: 'Washington',
            ordinal: 1,
            party: 'noparty',
            portrait: '/assets/images/washington.webp',
            bars: [
                {
                    severity: 10,
                    title: 'Enslaved More Than 300 People at Mount Vernon',
                    shortLabel: 'Enslaved 300+ People',
                    description: 'Washington enslaved people from the age of eleven until his death in 1799 — a period spanning nearly his entire life. At Mount Vernon in 1799, there were 317 enslaved people; 123 were legally owned by Washington himself, while the remainder were controlled through Martha Washington\'s dower estate. He relied on their forced, uncompensated labor to build and sustain the wealth, property, and social standing that made his political career possible. Washington did arrange in his will for the people he personally owned to be freed after Martha\'s death — a provision she enacted early — but this freed only those he legally owned and left the dower enslaved people, who were not his to free, bound to the Custis estate. The partial provision does not resolve the fundamental moral fact of a lifetime of slaveholding.',
                    sources: [
                        { url: 'https://www.mountvernon.org/george-washington/slavery/', text: 'Mount Vernon — George Washington and Slavery' },
                        { url: 'https://www.whitehousehistory.org/slavery-in-the-white-house-george-washington', text: 'White House Historical Association — Slavery in the White House: George Washington' }
                    ]
                },
                {
                    severity: 10,
                    title: 'Signed the Fugitive Slave Act of 1793',
                    shortLabel: 'Fugitive Slave Act 1793',
                    description: 'On February 12, 1793, Washington signed the first federal Fugitive Slave Act into law, creating a legal mechanism by which enslavers could pursue and reclaim escaped enslaved people across state lines and compelling free states to participate in their capture and return. The Act imposed penalties on anyone who harbored or assisted freedom-seekers and denied accused persons the right to a jury trial. As the first major federal legislation to nationalize slavery enforcement, it established a template — expanded and strengthened in 1850 — that made the entire country legally complicit in maintaining the institution of slavery for the next seven decades. Washington signed the Act as both the nation\'s chief executive and as one of its largest enslavers, with a direct personal interest in the legal infrastructure it created.',
                    sources: [
                        { url: 'https://www.archives.gov/milestone-documents/fugitive-slave-act', text: 'National Archives — Fugitive Slave Act of 1793: Historical Context' },
                        { url: 'https://www.loc.gov/item/rbpe.14000400/', text: 'Library of Congress — The Fugitive Slave Act of 1793: Primary Source Materials' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Pursued Ona Judge After She Escaped to Freedom',
                    shortLabel: 'Pursued Ona Judge',
                    description: 'In 1796, Ona Judge — an enslaved woman who had served in the Washington household since childhood — escaped from the President\'s House in Philadelphia after learning that Martha Washington intended to give her as a wedding gift to a granddaughter. Rather than accept her freedom, Washington orchestrated multiple attempts to have her captured and returned, using federal customs officials in New Hampshire as instruments of personal slave-catching while he was serving as president of the United States. The National Park Service and Mount Vernon both document her escape and Washington\'s persistent attempts to recover her. Judge evaded recapture, settled in New Hampshire, married, raised a family, and later gave interviews describing her determination never to return to slavery. Washington never stopped attempting to recover her.',
                    sources: [
                        { url: 'https://www.nps.gov/articles/ona-judge-washington-s-runaway-slave.htm', text: 'National Park Service — Ona Judge: Washington\'s Runaway Slave' },
                        { url: 'https://www.mountvernon.org/library/digitalhistory/digital-encyclopedia/article/ona-judge/', text: 'Mount Vernon — Ona Judge: Digital Encyclopedia Entry' }
                    ]
                },
                {
                    severity: 9,
                    title: 'Embodied American Liberty While Denying It to Those He Enslaved',
                    shortLabel: 'Liberty Contradiction',
                    description: 'Washington became the defining symbol of American republican virtue and freedom — the indispensable man whose image anchored the new nation\'s identity — while personally enslaving more than 300 people whose forced labor built and maintained the wealth and household that enabled his public life. This contradiction was not incidental or private; it was structural and public. Washington presided over a republic whose founding documents proclaimed universal human equality while its first president\'s home was operated by enslaved workers. His image defined what "American freedom" meant for generations while the people he enslaved were explicitly excluded from its protections, and his status as the national embodiment of liberty lent legitimacy to a social order built on the permanent denial of liberty to others.',
                    sources: [
                        { url: 'https://www.mountvernon.org/george-washington/slavery/ten-facts-about-washington-slavery/', text: 'Mount Vernon — Ten Facts About Washington and Slavery' },
                        { url: 'https://www.loc.gov/exhibits/jefferson/jeffamer.html', text: 'Library of Congress — The Contradiction of Liberty and Slavery in the Founding Era' }
                    ]
                },
                {
                    severity: 7,
                    title: 'Northwest Indian War and Forced Cession of Native Lands',
                    shortLabel: 'Northwest Indian War',
                    description: 'Washington\'s administration fought the Northwest Indian War against a confederation of Native nations — including the Shawnee, Miami, Delaware, and others — who were resisting U.S. expansion into lands north of the Ohio River. After U.S. forces defeated the confederacy at the Battle of Fallen Timbers in 1794, the 1795 Treaty of Greenville forced Native nations to cede the majority of what became Ohio and significant portions of future Indiana, Illinois, and Michigan. Washington\'s public rhetoric sometimes invoked "justice and humanity" toward Native peoples, but the consistent thrust of his Native policy was the acquisition of their land through military pressure, coerced treaties, and the promotion of debt-based economic dependency — anticipating the more systematic removal policies that followed under later administrations.',
                    sources: [
                        { url: 'https://www.nps.gov/articles/northwest-indian-war.htm', text: 'National Park Service — The Northwest Indian War' },
                        { url: 'https://history.state.gov/milestones/1784-1800/northwest-ordinance', text: 'U.S. State Department Office of the Historian — Northwest Territory and Native Land Cessions' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Purchased Teeth from Enslaved People for His Dentures',
                    shortLabel: 'Purchased Enslaved Teeth',
                    description: 'Mount Vernon\'s own records document a 1784 entry in Washington\'s account books recording payment "to Negroes for 9 teeth," associated with a French dentist who was treating Washington. Mount Vernon acknowledges the transaction is documented in the accounts and notes that the practice of purchasing teeth from living people — including enslaved people who had little meaningful ability to refuse — was a known phenomenon of the era. The power dynamics involved in an enslaver purchasing body parts from people he owned render the notion of voluntary sale deeply problematic. Mount Vernon states there is no definitive proof the specific teeth became part of surviving dentures, but the transaction itself stands as a documented example of the ways in which enslaved people\'s bodies were treated as resources available for extraction.',
                    sources: [
                        { url: 'https://www.mountvernon.org/george-washington/facts/washingtons-teeth/', text: 'Mount Vernon — George Washington\'s Teeth: The Historical Record' },
                        { url: 'https://www.mountvernon.org/george-washington/slavery/', text: 'Mount Vernon — Slavery at Mount Vernon: Documentation' }
                    ]
                },
                {
                    severity: 5,
                    title: 'Used Federal Military Force to Suppress the Whiskey Rebellion',
                    shortLabel: 'Whiskey Rebellion',
                    description: 'In 1794, when frontier farmers in western Pennsylvania resisted the federal excise tax on whiskey — a tax that fell disproportionately on small producers who used whiskey as a practical currency and trading commodity — Washington personally led a militia force of nearly 13,000 men into Pennsylvania to suppress the uprising, the largest military force assembled in the United States since the Revolutionary War. The rebellion collapsed without a major battle and the episode demonstrated that the new federal government could enforce its laws. Critics argued that the overwhelming force deployed against small farmers protesting a regressive tax established a troubling precedent for using federal military power against citizens exercising what they saw as a right of popular resistance.',
                    sources: [
                        { url: 'https://www.archives.gov/publications/prologue/1994/fall/whiskey-rebellion.html', text: 'National Archives — The Whiskey Rebellion (Prologue, Fall 1994)' },
                        { url: 'https://millercenter.org/president/washington/key-events', text: 'Miller Center — George Washington: The Whiskey Rebellion' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Backed a Regressive Whiskey Tax That Burdened Frontier Farmers',
                    shortLabel: 'Whiskey Tax',
                    description: 'Washington supported Alexander Hamilton\'s excise tax on whiskey, which was structured in a way that fell most heavily on small frontier distillers rather than large commercial operations. For farmers in western Pennsylvania and other frontier regions, whiskey was not merely a beverage but a practical economic medium — grain was difficult and expensive to transport east, but distilled into whiskey it became portable and tradeable. The tax effectively penalized the economic practices of frontier communities that lacked the infrastructure and cash liquidity of eastern merchants. Washington\'s backing of the policy reflected a Hamiltonian vision of federal fiscal authority that prioritized revenue and creditor confidence over the economic interests of the rural working poor.',
                    sources: [
                        { url: 'https://millercenter.org/president/washington/domestic-affairs', text: 'Miller Center — Washington: Domestic Affairs and the Whiskey Tax' },
                        { url: 'https://www.britannica.com/event/Whiskey-Rebellion', text: 'Britannica — Whiskey Rebellion: Origins and the Excise Tax' }
                    ]
                },
                {
                    severity: 4,
                    title: 'Established Strong Executive Precedents That Expanded Presidential Power',
                    shortLabel: 'Executive Precedents',
                    description: 'Washington\'s presidency necessarily involved establishing precedents where none existed, and many of his choices expanded executive authority in ways that outlasted their original context. His unilateral declaration of neutrality in the conflict between Britain and France — without consulting Congress — established a precedent for executive foreign policy independence. His assertion of executive privilege during the Jay Treaty debates set a template for presidents withholding information from Congress. His use of military force in the Whiskey Rebellion established federal enforcement power over internal resistance. Many of these precedents were arguably necessary to create a functioning executive, but Anti-Federalist critics at the time warned they were building a presidency more powerful than the Constitution\'s democratic structure could safely accommodate.',
                    sources: [
                        { url: 'https://millercenter.org/president/washington/key-events', text: 'Miller Center — George Washington: Key Presidential Precedents' },
                        { url: 'https://www.britannica.com/biography/George-Washington/Presidency', text: 'Britannica — George Washington: The Presidency and Executive Power' }
                    ]
                },
                {
                    severity: 6,
                    title: 'Prioritized National Unity Over Challenging Slavery While President',
                    shortLabel: 'Silence on Slavery',
                    description: 'Washington privately grew more uncomfortable with slavery over the course of his life and presidency — his will\'s manumission provision suggests genuine moral unease — but he took no meaningful public action against the institution while president, despite holding the most powerful platform in the new republic. His overriding priority was preserving the fragile Union, and he recognized that any serious federal challenge to slavery would fracture the Southern states\' commitment to it. The result was a deliberate presidential silence that left slavery not merely tolerated but actively protected by the federal legal architecture Washington\'s administration helped construct, including the Fugitive Slave Act of 1793. His caution was politically understandable; its cost was leaving the nation\'s founding moral contradiction unaddressed at the moment it might have been most tractable.',
                    sources: [
                        { url: 'https://www.mountvernon.org/george-washington/slavery/washington-and-slavery/', text: 'Mount Vernon — Washington\'s Evolving Views on Slavery' },
                        { url: 'https://millercenter.org/president/washington/domestic-affairs', text: 'Miller Center — Washington: Slavery and the Limits of Presidential Leadership' }
                    ]
                },
            ]
        }


    };

    /* --------------------------------------------------------------------------
       Selection — which president is currently shown on each side. The
       pickers mutate this. These are the defaults; a matchup encoded in
       the URL (?left=<id>&right=<id>) overrides them on load — see
       readSelectionFromUrl below.
       -------------------------------------------------------------------------- */
    const selection = {
        left: 'biden',
        right: 'trump'
    };

    /* --------------------------------------------------------------------------
       URL persistence — a matchup can be shared or bookmarked via
       ?left=<id>&right=<id> search params. On load we read them, ignoring
       unknown ids and any pairing that would put the same president on
       both sides (the picker forbids that, so the URL must too). On every
       picker change syncSelectionToUrl writes the current selection back
       with history.replaceState, keeping the address bar in sync without
       stacking entries on the back button.
       -------------------------------------------------------------------------- */
    (function readSelectionFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const left = params.get('left');
        const right = params.get('right');
        if (left && presidents[left]) selection.left = left;
        // The right side may not duplicate whatever left just resolved to.
        if (right && presidents[right] && right !== selection.left) {
            selection.right = right;
        }
    })();

    function syncSelectionToUrl() {
        const params = new URLSearchParams(window.location.search);
        params.set('left', selection.left);
        params.set('right', selection.right);
        history.replaceState(
            null,
            '',
            window.location.pathname + '?' + params.toString() + window.location.hash
        );
    }

    /* --------------------------------------------------------------------------
       formatOrdinal — turn 46 into "46<sup>th</sup> President" or
       [45, 47] into "45<sup>th</sup> & 47<sup>th</sup> President".

       Returns HTML (not plain text) because the styling of the suffix
       relies on the <sup> tag — see `.name-detail sup` in styles.css.
       Callers must use innerHTML, not textContent. The data is author-
       controlled (defined above in this file), so this is safe.
       -------------------------------------------------------------------------- */
    // Ordinal suffix for a number — 'st', 'nd', 'rd', or 'th'.
    // 11/12/13 are the special cases that don't follow the last-digit
    // rule — they all take 'th'.
    function ordinalSuffix(num) {
        const lastDigit = num % 10;
        const lastTwo = num % 100;
        if (lastDigit === 1 && lastTwo !== 11) return 'st';
        if (lastDigit === 2 && lastTwo !== 12) return 'nd';
        if (lastDigit === 3 && lastTwo !== 13) return 'rd';
        return 'th';
    }

    function formatOrdinal(n) {
        function fmt(num) {
            return num + '<sup>' + ordinalSuffix(num) + '</sup>';
        }
        if (Array.isArray(n)) {
            return n.map(fmt).join(' &amp; ') + ' President';
        }
        return fmt(n) + ' President';
    }

    /* --------------------------------------------------------------------------
       formatParty — turn a party id ("democratic-republican") into a
       display label ("Democratic-Republican"). Title-cases each hyphen-
       separated segment so any future party id renders correctly without
       a hardcoded lookup.
       -------------------------------------------------------------------------- */
    function formatParty(party) {
        if (!party) return '';
        // Special case — Washington and any other unaffiliated executive
        // render as "Nonpartisan" rather than a literal "Noparty".
        if (party === 'noparty') return 'Nonpartisan';
        return party
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join('-');
    }

    /* --------------------------------------------------------------------------
       Render — build bar markup from the data above and inject into the
       containers. Runs once on script load (the script is `defer`-ed in
       the HTML, so the DOM is parsed by the time we get here) and again
       whenever `selection[side]` changes via a picker.

       Bar entrance choreography lives in CSS. The only timing data JS
       contributes is each bar's index, written to a --bar-index custom
       property on the .bar element; CSS does the calc() to derive the
       per-element animation-delay from that index. Adding a 6th, 7th,
       Nth bar Just Works — the index increments and the existing CSS
       rules pick it up. To retune the choreography, edit the
       --bar-*-base-delay / --bar-stagger variables in the CSS :root
       block; no JS change or page reload of this file is required.
       -------------------------------------------------------------------------- */

    /* --------------------------------------------------------------------------
       Bar template — the inert markup lives in index.html as
       <template id="bar-template">. We grab it once at module init and
       cloneNode for each bar rather than reparsing a string per render.

       Why a template instead of an HTML string + innerHTML:

         1. Safety is structural. textContent and the DOM attribute APIs
            escape by definition, so bar data cannot break out of its
            insertion context — no hand-rolled escapeHtml to call (and
            forget) at every interpolation site. The day user-submitted
            bars land in V2, the renderer is already safe by default.

         2. Refactor-friendly. Adding a new field or rearranging the
            structure means editing one HTML block, not chasing string
            concatenations across a render function.

         3. Cheaper on re-render. The template's DocumentFragment is
            parsed once; subsequent clones are a tree copy, not a parse.
       -------------------------------------------------------------------------- */
    const barTemplate = document.getElementById('bar-template');

    function renderBar(bar, index, side) {
        // Clone the <article class="bar"> sub-tree from the template's
        // DocumentFragment. firstElementChild skips any whitespace text
        // nodes the HTML parser left around our <article>.
        const node = barTemplate.content.firstElementChild.cloneNode(true);

        node.dataset.side = side;
        // Expose the bar's ordinal position to CSS; the entrance
        // animation-delay rules in preside-by-side.css read this via
        // var(--bar-index) and inherit it to .bar-fill / .severity-number /
        // .bar-label-outer. JS owns the index, CSS owns the timing.
        node.style.setProperty('--bar-index', index);

        // Per-side ID prefix so the left and right columns never collide
        // on label/detail ids — they share a single document.
        const idPrefix = side === 'left' ? 'L' : 'R';
        const labelId = 'label-' + idPrefix + (index + 1);
        const detailId = 'detail-' + idPrefix + (index + 1);

        const labelOuter = node.querySelector('.bar-label-outer');
        labelOuter.id = labelId;
        labelOuter.textContent = bar.shortLabel;

        const fill = node.querySelector('.bar-fill');
        fill.setAttribute('aria-controls', detailId);
        fill.setAttribute('aria-labelledby', labelId);
        fill.dataset.title = bar.title;
        // --severity is read by the bar's clip-path reveal width in CSS,
        // so this single custom property drives both the visual length
        // and the on-bar number.
        fill.style.setProperty('--severity', bar.severity);

        node.querySelector('.severity-number').textContent = bar.severity;
        node.querySelector('.bar-label-inner').textContent = bar.shortLabel;

        const detail = node.querySelector('.bar-detail');
        detail.id = detailId;

        node.querySelector('.detail-title').textContent = bar.title;
        node.querySelector('.detail-description').textContent = bar.description;

        // Build the sources list with createElement so the href is set
        // via the DOM API (not interpolated into an HTML string) and the
        // link text is set via textContent. The href is also scheme-checked
        // so a hostile `javascript:` URL cannot execute at click time.
        const sourcesList = node.querySelector('.sources-list');
        bar.sources.forEach(function (src) {
            const li = document.createElement('li');
            const a = document.createElement('a');
            const safeUrl = /^https?:\/\//i.test(src.url) ? src.url : '#';
            a.href = safeUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = src.text;
            li.appendChild(a);
            sourcesList.appendChild(li);
        });

        // Right-side bars need the outer label AFTER the bar in DOM
        // order so it ends up on the outside edge (away from the
        // centerline). The template authors left-side order; we move
        // the label to the end of the row for right-side bars rather
        // than maintain two parallel templates.
        if (side === 'right') {
            const row = node.querySelector('.bar-row');
            row.appendChild(labelOuter);
        }

        return node;
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
            // The bar-fill's entrance animation is a clip-path reveal
            // rather than a scaleX transform, so the element's layout
            // box is honest at every frame of the animation. That means
            // getBoundingClientRect reports the bar's true on-screen
            // rect even on the very first paint, and we can read its
            // edges directly without falling back to offsetLeft/
            // offsetWidth + offsetParent gymnastics.
            const fillRect = fill.getBoundingClientRect();
            const fillLayoutLeft = fillRect.left;
            const fillLayoutRight = fillRect.right;
            const side = bar.dataset.side;

            let availableOuter = 0;

            if (side === 'left') {
                // Label sits to the LEFT of the bar; gutter is from
                // the viewport edge to the bar's left edge.
                availableOuter = fillLayoutLeft - GAP - SAFETY - BREATHING;
            } else {
                // Label sits to the RIGHT of the bar; gutter is from
                // the bar's right edge to the viewport edge.
                availableOuter = vw - fillLayoutRight - GAP - SAFETY - BREATHING;
            }

            // Fire the tight fallback proactively whenever the label's
            // natural single-line width exceeds the gutter, so labels
            // wrap *before* they get visually cramped against the bar
            // or clip past the viewport edge.
            if (labelRect.width <= availableOuter) return;
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
        // The picker trigger button carries the accessible name for the
        // dropdown. The visible spans below are aria-hidden, so the
        // button's aria-label must carry the full identifying text and
        // an action hint — kept in sync with `selection[side]` on every
        // re-render.
        const trigger = cell.querySelector('.picker-badge');
        const sideWord = side === 'left' ? 'Left' : 'Right';

        const nf = cell.querySelector('.name-first');
        const ln = cell.querySelector('.last-name');
        const nd = cell.querySelector('.name-detail');
        const np = cell.querySelector('.name-party');

        const president = presidents[selection[side]];
        if (!president) {
            // Mirror the renderSide defensive path — clear rather than crash.
            if (nf) nf.textContent = '';
            if (ln) ln.textContent = '';
            if (nd) nd.textContent = '';
            if (np) np.textContent = '';
            if (sideEl) sideEl.setAttribute('aria-label', side === 'left' ? 'Left president' : 'Right president');
            // Fall back to the generic picker label when no president is
            // resolved (e.g. an unknown selection id).
            if (trigger) trigger.setAttribute('aria-label', 'Pick president for the ' + sideWord.toLowerCase() + ' side');
            return;
        }

        // textContent for plain strings (auto-escapes anything weird).
        if (nf) nf.textContent = president.firstName;
        if (ln) ln.textContent = president.lastName;
        // innerHTML for the ordinal because formatOrdinal returns markup
        // (sup tags). Safe because the input is author-controlled data.
        if (nd) nd.innerHTML = formatOrdinal(president.ordinal);
        if (np) np.textContent = formatParty(president.party);

        // Rich, dynamic aria-label collapses what would otherwise be two
        // separate screen-reader announcements (label + current option)
        // into one self-describing string, e.g. "Left president: Biden —
        // change". lastName is preferred over firstName + lastName here
        // to match what's visually emphasized in the badge and what each
        // option's textContent says, keeping the spoken label aligned
        // with the visual UI.
        if (trigger) {
            trigger.setAttribute(
                'aria-label',
                sideWord + ' president: ' + (president.displayName || president.lastName) + ' — change'
            );
        }

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
       Portrait — swap the <img> src on the masthead portrait for this side.

       The <img> tag itself stays put across selection changes; only `src`,
       `alt`, and the data-loaded flag get updated. The CSS animation reads
       data-loaded, so removing it before setting a new src restarts the
       fade-in for the next portrait. If the new president has no portrait
       defined, the img stays hidden (no src, no data-loaded).
       -------------------------------------------------------------------------- */
    function renderPortrait(side) {
        const img = document.querySelector('.president-portrait[data-side="' + side + '"]');
        if (!img) return;

        const president = presidents[selection[side]];

        // Drop any prior loaded state so the animation can replay for the
        // new portrait once it loads.
        img.removeAttribute('data-loaded');

        // Force a style flush between the remove above and any (potentially
        // synchronous) re-add below. For a cached portrait, img.complete
        // becomes true immediately after `img.src = ...`, so the `if` block
        // further down sets data-loaded back in the same task — without
        // this flush the browser would only see the net state (still
        // present), wouldn't register a [data-loaded] transition, and the
        // portraitFadeIn animation wouldn't restart. The previous portrait's
        // animation is `forwards`, so the new image would inherit its final
        // opacity (0.7) and appear to pop in instead of fading. Reading
        // offsetWidth forces a synchronous layout + style recalc, which
        // makes the un-loaded state observable.
        void img.offsetWidth;

        if (!president || !president.portrait) {
            img.removeAttribute('src');
            img.alt = '';
            return;
        }

        img.alt = president.firstName + ' ' + president.lastName;
        // Wait for the new image to finish decoding before flipping
        // data-loaded — otherwise the fade-in can start against a blank
        // <img> and snap to the image mid-animation.
        img.onload = function () {
            img.setAttribute('data-loaded', '');
        };
        img.onerror = function () {
            img.removeAttribute('src');
            img.removeAttribute('data-loaded');
            img.alt = '';
        };
        img.src = president.portrait;
        // Some browsers cache the image and skip onload — handle that.
        if (img.complete && img.naturalWidth > 0) {
            img.setAttribute('data-loaded', '');
        }
    }

    /* --------------------------------------------------------------------------
       Picker — custom listbox popover, grouped by party.

       Replaces a native <select>: the badge is a <button> that toggles
       a styled .picker-menu sibling inside .picker-cell. Each call wipes
       and rebuilds the menu's sections + options. Cheap enough (under
       ~20 options) that diffing isn't worth the complexity.

       Each call recomputes:
         - Sections, grouped by party. Section order is fixed below.
         - Options within a section, sorted chronologically by ordinal.
         - The OTHER side's current selection rendered as disabled
           (visible but not pickable), so users can see who they'd be
           displacing rather than having that president silently vanish.
         - This side's current selection marked aria-selected + checked.
       -------------------------------------------------------------------------- */

    // The menu is laid out in three columns: Democrats, Republicans,
    // and Other (a catch-all for historical/minor parties). Each column
    // can contain one or more party sections.
    const PARTY_COLUMNS = [
        { id: 'democrats', parties: ['democrat'] },
        { id: 'republicans', parties: ['republican'] },
        { id: 'other', parties: ['democratic-republican', 'federalist', 'whig', 'noparty'] }
    ];
    const PARTY_LABELS = {
        democrat: 'Democrats',
        republican: 'Republicans',
        'democratic-republican': 'Democratic-Republicans',
        federalist: 'Federalists',
        whig: 'Whigs',
        noparty: 'Nonpartisan'
    };

    // Smaller ordinal-only formatter for menu rows (e.g. "46th",
    // "45th & 47th"). The badge's formatOrdinal appends "President"
    // which would be redundant in a list of presidents.
    // Multi-term presidents (Cleveland, Trump) get newline-joined
    // ordinals so each fits in the narrow ordinal column without
    // overlapping the name; the CSS uses white-space: pre-line.
    function formatOrdinalShort(n) {
        function fmt(num) { return num + ordinalSuffix(num); }
        if (Array.isArray(n)) return n.map(fmt).join('\n&\n');
        return fmt(n);
    }

    function firstOrdinal(p) {
        return Array.isArray(p.ordinal) ? p.ordinal[0] : p.ordinal;
    }

    // Most recent (largest) ordinal — Cleveland and Trump have two
    // non-consecutive terms; for "sort by most recent" we want the
    // later term to anchor their position.
    function latestOrdinal(p) {
        return Array.isArray(p.ordinal) ? Math.max.apply(null, p.ordinal) : p.ordinal;
    }

    function renderPicker(side) {
        const trigger = document.getElementById('picker-' + side);
        const menu = document.getElementById('picker-menu-' + side);
        if (!trigger || !menu) return;

        const otherSide = side === 'left' ? 'right' : 'left';
        const disabledId = selection[otherSide];
        const currentId = selection[side];

        // Drive the picker cell's border tint via data-party. The
        // .picker-badge base rule reads rgba(var(--party-rgb), 0.45),
        // so changing data-party on the cell recolors the border.
        const cell = trigger.closest('.picker-cell');
        const currentPresident = presidents[currentId];
        if (cell && currentPresident) {
            cell.dataset.party = currentPresident.party;
        }

        // Bucket presidents by party in a single pass, then sort each
        // bucket by most recent ordinal first (largest at top).
        const buckets = {};
        Object.values(presidents).forEach(function (p) {
            (buckets[p.party] = buckets[p.party] || []).push(p);
        });
        Object.keys(buckets).forEach(function (party) {
            buckets[party].sort(function (a, b) {
                return latestOrdinal(b) - latestOrdinal(a);
            });
        });

        const frag = document.createDocumentFragment();

        PARTY_COLUMNS.forEach(function (col) {
            const column = document.createElement('div');
            column.className = 'picker-column';
            column.dataset.column = col.id;

            col.parties.forEach(function (party) {
                const list = buckets[party];
                if (!list || list.length === 0) return;

                const section = document.createElement('div');
                section.className = 'picker-section';
                section.dataset.party = party;
                section.setAttribute('role', 'group');

                const headerId = 'picker-' + side + '-section-' + party;
                const header = document.createElement('div');
                header.className = 'picker-section-header';
                header.id = headerId;
                header.textContent = PARTY_LABELS[party] || formatParty(party);
                section.setAttribute('aria-labelledby', headerId);
                section.appendChild(header);

                list.forEach(function (p) {
                    const opt = document.createElement('button');
                    opt.type = 'button';
                    opt.className = 'picker-option';
                    opt.dataset.id = p.id;
                    opt.id = 'picker-' + side + '-opt-' + p.id;
                    opt.setAttribute('role', 'option');
                    opt.setAttribute('tabindex', '-1');
                    if (Array.isArray(p.ordinal) && p.ordinal.length > 1) {
                        opt.dataset.multiOrdinal = 'true';
                    }

                    const isSelected = p.id === currentId;
                    const isDisabled = p.id === disabledId;
                    opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                    if (isDisabled) {
                        opt.setAttribute('aria-disabled', 'true');
                        opt.setAttribute('aria-label',
                            (p.displayName || (p.firstName + ' ' + p.lastName)) +
                            ' — already chosen on the ' + otherSide + ' side');
                    }

                    const ordinal = document.createElement('span');
                    ordinal.className = 'picker-option-ordinal';
                    ordinal.textContent = formatOrdinalShort(p.ordinal);
                    opt.appendChild(ordinal);

                    const name = document.createElement('span');
                    name.className = 'picker-option-name';
                    name.textContent = p.displayName || (p.firstName + ' ' + p.lastName);
                    opt.appendChild(name);

                    const check = document.createElement('span');
                    check.className = 'picker-option-check';
                    check.setAttribute('aria-hidden', 'true');
                    check.textContent = '✓';
                    opt.appendChild(check);

                    section.appendChild(opt);
                });

                column.appendChild(section);
            });

            frag.appendChild(column);
        });

        menu.replaceChildren(frag);

        // Keep aria-activedescendant on the listbox pointing at the
        // currently-selected option so screen readers announce the
        // right row when the menu is opened with the keyboard.
        const selectedOpt = menu.querySelector('.picker-option[aria-selected="true"]');
        if (selectedOpt) {
            menu.setAttribute('aria-activedescendant', selectedOpt.id);
        } else {
            menu.removeAttribute('aria-activedescendant');
        }
    }

    /* --------------------------------------------------------------------------
       Picker open/close + keyboard nav.

       Exactly one menu open at a time. Click-outside, Escape, and
       selecting an option all close it; closing always returns focus
       to the trigger button so keyboard users land back where they
       started.

       Keyboard model on the menu:
         - ArrowDown / ArrowUp move the "active" option (visual
           highlight + aria-activedescendant), skipping disabled rows.
         - Home / End jump to first/last enabled option.
         - Enter / Space pick the active option.
         - Escape closes.
       The listbox itself takes focus (tabindex=-1) when opened so the
       keyboard handler below sees keydown events.
       -------------------------------------------------------------------------- */
    let openSide = null;

    function getEnabledOptions(menu) {
        return Array.prototype.slice.call(
            menu.querySelectorAll('.picker-option:not([aria-disabled="true"])')
        );
    }

    function setActiveOption(menu, opt) {
        if (!opt) return;
        menu.querySelectorAll('.picker-option.is-active').forEach(function (n) {
            n.classList.remove('is-active');
        });
        opt.classList.add('is-active');
        menu.setAttribute('aria-activedescendant', opt.id);
        // Keep the active row in view without scrolling the whole page.
        if (typeof opt.scrollIntoView === 'function') {
            opt.scrollIntoView({ block: 'nearest' });
        }
    }

    function openPicker(side) {
        if (openSide && openSide !== side) closePicker(openSide, { restoreFocus: false });
        const trigger = document.getElementById('picker-' + side);
        const menu = document.getElementById('picker-menu-' + side);
        if (!trigger || !menu) return;

        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        openSide = side;

        // Seed the active option to the current selection so arrow keys
        // start from the user's known anchor instead of the top.
        const selectedOpt = menu.querySelector('.picker-option[aria-selected="true"]');
        const firstEnabled = getEnabledOptions(menu)[0];
        const initial = (selectedOpt && selectedOpt.getAttribute('aria-disabled') !== 'true')
            ? selectedOpt
            : firstEnabled;
        if (initial) setActiveOption(menu, initial);

        // Defer focus by a tick — flipping `hidden` and then immediately
        // focusing in the same task can be ignored by some browsers.
        requestAnimationFrame(function () { menu.focus(); });
    }

    function closePicker(side, opts) {
        const trigger = document.getElementById('picker-' + side);
        const menu = document.getElementById('picker-menu-' + side);
        if (!trigger || !menu) return;
        if (menu.hidden) return;

        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        if (openSide === side) openSide = null;

        if (!opts || opts.restoreFocus !== false) {
            trigger.focus();
        }
    }

    function togglePicker(side) {
        const menu = document.getElementById('picker-menu-' + side);
        if (!menu) return;
        if (menu.hidden) openPicker(side);
        else closePicker(side);
    }

    function onPickerChange(side, newId) {
        if (selection[side] === newId) return;     // no-op
        if (!presidents[newId]) return;            // defensive: unknown id

        selection[side] = newId;
        syncSelectionToUrl();
        renderSide(side);
        renderNameBadge(side);
        renderPortrait(side);
        // Both pickers need a rebuild: this side's selected row moves,
        // and the OTHER side's disabled row moves to the new selection.
        renderPicker(side);
        renderPicker(side === 'left' ? 'right' : 'left');
        applyLabelTightFit();
    }

    // Wire trigger buttons + menus once. Children inside them get
    // replaced on every renderPicker, but these top-level listeners
    // survive across re-renders.
    ['left', 'right'].forEach(function (side) {
        const trigger = document.getElementById('picker-' + side);
        const menu = document.getElementById('picker-menu-' + side);
        if (!trigger || !menu) return;

        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            togglePicker(side);
        });

        trigger.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPicker(side);
            }
        });

        // Use a click delegate on the menu so newly rendered options
        // are handled without re-binding per option.
        menu.addEventListener('click', function (e) {
            const opt = e.target.closest('.picker-option');
            if (!opt || !menu.contains(opt)) return;
            if (opt.getAttribute('aria-disabled') === 'true') return;
            onPickerChange(side, opt.dataset.id);
            closePicker(side);
        });

        menu.addEventListener('mousemove', function (e) {
            const opt = e.target.closest('.picker-option');
            if (!opt || opt.getAttribute('aria-disabled') === 'true') return;
            setActiveOption(menu, opt);
        });

        menu.addEventListener('keydown', function (e) {
            const options = getEnabledOptions(menu);
            if (options.length === 0) return;
            const active = menu.querySelector('.picker-option.is-active');
            const idx = active ? options.indexOf(active) : -1;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setActiveOption(menu, options[(idx + 1 + options.length) % options.length]);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setActiveOption(menu, options[(idx - 1 + options.length) % options.length]);
                    break;
                case 'Home':
                    e.preventDefault();
                    setActiveOption(menu, options[0]);
                    break;
                case 'End':
                    e.preventDefault();
                    setActiveOption(menu, options[options.length - 1]);
                    break;
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    if (active) {
                        onPickerChange(side, active.dataset.id);
                        closePicker(side);
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    closePicker(side);
                    break;
                case 'Tab':
                    closePicker(side, { restoreFocus: false });
                    break;
            }
        });
    });

    // Click anywhere outside the open picker closes it. Captured at the
    // document level since the menus float over the comparison content.
    document.addEventListener('click', function (e) {
        if (!openSide) return;
        const cell = document.querySelector('.picker-cell[data-side="' + openSide + '"]');
        if (cell && cell.contains(e.target)) return;
        closePicker(openSide, { restoreFocus: false });
    });

    // Closing on Escape from anywhere — handy when focus has drifted
    // off the menu (e.g. after a tab out).
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && openSide) {
            closePicker(openSide);
        }
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
    renderPortrait('left');
    renderPortrait('right');
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

        // Wait for the slide-out to finish before actually closing the
        // dialog — otherwise it snaps to display:none mid-frame and the
        // exit animation is never seen. We listen to the sheet's own
        // `transitionend` rather than a setTimeout tied to a hard-coded
        // duration: if anyone tweaks the CSS `transition: transform 0.4s`
        // value the JS keeps working automatically, with no hidden
        // CSS↔JS coupling waiting to break.
        const sheet = modal.querySelector('.modal-sheet');

        const finalizeClose = () => {
            if (modal.open) modal.close();
            if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
                lastFocusedBeforeModal.focus();
            }
            lastFocusedBeforeModal = null;
        };

        // Defensive fallback: if the sheet element is missing for any
        // reason (markup change, etc.), close immediately rather than
        // leaving the dialog stuck open waiting for an event that will
        // never fire.
        if (!sheet) {
            finalizeClose();
            return;
        }

        // `transitionend` fires once per animated property on the sheet.
        // Filtering by `propertyName` — and by `e.target` so a bubbled
        // event from a descendant element can't trigger close — is the
        // same pattern used in `collapseBar` above. Without the filter
        // we'd finalize on whichever property happens to finish first,
        // which may not be the visible slide.
        const onEnd = (e) => {
            if (e.target !== sheet || e.propertyName !== 'transform') return;
            sheet.removeEventListener('transitionend', onEnd);
            finalizeClose();
        };
        sheet.addEventListener('transitionend', onEnd);
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