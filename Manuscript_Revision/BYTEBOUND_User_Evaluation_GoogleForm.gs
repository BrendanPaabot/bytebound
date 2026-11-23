/**
 * BYTEBOUND: CITCS Quest — Google Form & Auto-Scoring Sheet Generator
 * Adapted from PLMun – CITCS System Evaluation Instrument (For Actual Users)
 * Reference Standard: ISO/IEC 25010:2023 (Product Quality Model)
 *
 * Researchers: Brendan C. Paabot, Junior J. Millena, Gabriel Arcenal (BSIT-4R)
 * Institution: Pamantasan ng Lungsod ng Muntinlupa — CITCS
 *
 * HOW TO RUN:
 * 1. Go to https://script.google.com and click "New project".
 * 2. Delete any placeholder code and paste this entire script.
 * 3. (Optional) Paste your live Vercel link into GAME_URL below.
 * 4. Click Save (Ctrl+S), select "createByteboundUserEvaluationForm", and click "Run".
 * 5. Approve Google permissions when prompted.
 * 6. Open the Execution Log at the bottom to copy your live Form Link & Summary Sheet Link!
 */

const GAME_URL = ''; // Optional: e.g., 'https://bytebound-citcs.vercel.app'

function createByteboundUserEvaluationForm() {
  const formTitle = 'BYTEBOUND: CITCS Quest — System Evaluation Survey (Actual Users)';

  const gameLinkLine = GAME_URL
    ? '\nPlay / Test BYTEBOUND here before answering:\n' + GAME_URL + '\n'
    : '';

  const formDescription =
    'Good day! We are 4th-year Bachelor of Science in Information Technology (BSIT-4R) students from the College of Information Technology and Computer Studies (CITCS) at Pamantasan ng Lungsod ng Muntinlupa (PLMun).\n\n' +
    'As part of our capstone project entitled:\n' +
    '"DEVELOPMENT OF A WEB-BASED ADAPTIVE TURN-BASED EDUCATIONAL GAME FOR PLMUN STUDENTS (BYTEBOUND: CITCS Quest)"\n' +
    'we respectfully invite you to evaluate our developed web-based educational game. BYTEBOUND combines two-dimensional room exploration, turn-based card combat, non-combat Topic Drills, a Diagnostic Learning Tracker, and Online 1v1 duels with an adaptive learning engine covering Computer Systems, Networking & Security, Programming, and Database.\n' +
    gameLinkLine + '\n' +
    'Your voluntary participation and honest feedback will be greatly appreciated and will help us evaluate and improve the quality of our system. Rest assured that all information and responses gathered in this form will be treated with strict confidentiality and used solely for academic capstone evaluation purposes in accordance with the Data Privacy Act of 2012 (RA 10173).\n\n' +
    'INSTRUCTIONS:\n' +
    'Please evaluate BYTEBOUND: CITCS Quest based on your actual experience in using the system. Select the rating that best represents your assessment of each statement, or select N/A if the statement does not apply or you cannot assess it.\n\n' +
    'RATING SCALE:\n' +
    '5 - Excellent | 4 - Very Good | 3 - Good | 2 - Fair | 1 - Poor | N/A - Not Applicable\n\n' +
    'Thank you very much for your time and support!\n' +
    '— BSIT-4R Researchers (Brendan C. Paabot, Junior J. Millena, & Gabriel Arcenal)';

  const form = FormApp.create(formTitle);
  form
    .setTitle(formTitle)
    .setDescription(formDescription)
    .setProgressBar(true)
    .setCollectEmail(false)
    .setAllowResponseEdits(false)
    .setLimitOneResponsePerUser(false)
    .setConfirmationMessage(
      'Thank you very much for volunteering your time to evaluate BYTEBOUND: CITCS Quest! Your feedback is deeply appreciated and greatly helps our BSIT-4R capstone study.\n\n— Brendan C. Paabot, Junior J. Millena, & Gabriel Arcenal (BSIT-4R, PLMun-CITCS)'
    );

  // =========================================================================
  // SECTION 1: RESPONDENT INFORMATION & CONSENT
  // =========================================================================
  form.addTextItem()
    .setTitle('Full Name')
    .setHelpText('Enter your full name (e.g., Juan Dela Cruz).')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Year & Section')
    .setHelpText('Enter your course, year, and section (e.g., BSIT-4R, BSIT-3A, BSCS-2B).')
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('Voluntary Participation & Data Privacy Consent')
    .setChoiceValues([
      'I voluntarily agree to participate in this BSIT-4R capstone evaluation and consent to the use of my responses strictly for academic purposes.'
    ])
    .setRequired(true);

  // =========================================================================
  // SECTION 2: SYSTEM EVALUATION INDICATORS (ISO/IEC 25010:2023 — ACTUAL USERS)
  // 6 Quality Factors, each grouping 3 BYTEBOUND-specific indicators on a
  // 5-Point Likert Scale + N/A (matching the official PLMun-CITCS instrument)
  // =========================================================================
  form.addPageBreakItem()
    .setTitle('System Evaluation Indicators (ISO/IEC 25010:2023)')
    .setHelpText(
      'Rate each statement based on your actual experience playing and using BYTEBOUND: CITCS Quest.\n' +
      'Scale: 5 = Excellent | 4 = Very Good | 3 = Good | 2 = Fair | 1 = Poor | N/A = Not Applicable'
    );

  const likertColumns = [
    '5 - Excellent',
    '4 - Very Good',
    '3 - Good',
    '2 - Fair',
    '1 - Poor',
    'N/A'
  ];

  const factors = [
    {
      title: 'A. FUNCTIONAL SUITABILITY',
      help: 'Assesses whether BYTEBOUND provides complete, accurate, and appropriate educational game features.',
      colRange: 'E2:G',
      rows: [
        '1. BYTEBOUND provides the features needed to review CITCS computing subjects (Campaign exploration, turn-based card combat, Topic Drill, Learning Tracker, and Online 1v1 matches).',
        '2. BYTEBOUND produces correct and accurate quiz results, adaptive difficulty adjustments, spaced-repetition review items, combat calculations, and Learning Tracker progress analytics.',
        '3. The available game modes, adaptive computing questions, immediate conceptual explanations, and progress reports are appropriate for my subject review needs.'
      ]
    },
    {
      title: 'B. PERFORMANCE EFFICIENCY',
      help: 'Assesses BYTEBOUND\'s responsiveness, loading speed, and smooth browser performance.',
      colRange: 'H2:J',
      rows: [
        '1. BYTEBOUND responds within an acceptable amount of time when moving across rooms, playing combat cards, answering questions, or switching Quest Hub screens.',
        '2. BYTEBOUND loads battle arenas, quiz prompts, Topic Drills, Learning Tracker charts, and Online 1v1 turns smoothly without unnecessary delays.',
        '3. BYTEBOUND runs efficiently in my web browser during normal gameplay and study sessions without slowing down my device.'
      ]
    },
    {
      title: 'C. COMPATIBILITY',
      help: 'Assesses cross-device browser support, co-existence, and cloud/report data exchange.',
      colRange: 'K2:M',
      rows: [
        '1. BYTEBOUND works properly on my device and web browser (desktop monitor, mobile landscape, or mobile portrait handheld layout) without display clipping or broken controls.',
        '2. BYTEBOUND works cleanly alongside other browser tabs, applications, or study tools I use without causing problems.',
        '3. BYTEBOUND properly syncs my player profile, mastery progress, leaderboards, and Online 1v1 matches with cloud storage, and accurately exports my progress report as a CSV file.'
      ]
    },
    {
      title: 'D. INTERACTION CAPABILITY',
      help: 'Assesses interface clarity, ease of learning, and instructional/gameplay feedback.',
      colRange: 'N2:P',
      rows: [
        '1. BYTEBOUND\'s screens, menus, Quest Hub dashboard, Campaign Map, HUD meters, and navigation controls are clear and easy to understand.',
        '2. I can easily learn how to sign in, fight using combat cards, use Topic Drill, allocate Skill Tree points, and complete tasks in BYTEBOUND without difficulty.',
        '3. BYTEBOUND provides clear instructions, hover prompts, adaptive reason labels (e.g., Weak Topic Focus, Spaced Review), and immediate answer explanations whenever I perform an action.'
      ]
    },
    {
      title: 'E. RELIABILITY',
      help: 'Assesses availability, fault-free consistency, and progress recovery during interruptions.',
      colRange: 'Q2:S',
      rows: [
        '1. BYTEBOUND is available and accessible in my browser whenever I need to use it.',
        '2. BYTEBOUND performs consistently across exploration, card combat, Topic Drills, and Online 1v1 matches without frequent errors, freezes, or unexpected interruptions.',
        '3. When an error or internet interruption occurs, BYTEBOUND handles it appropriately and lets me continue or recover my progress through browser local storage, save slots, or cloud sync.'
      ]
    },
    {
      title: 'F. SECURITY (USER PERSPECTIVE)',
      help: 'Assesses unique player identification, account isolation, and data privacy protection.',
      colRange: 'T2:V',
      rows: [
        '1. BYTEBOUND requires me to sign in using my unique player handle (automatically assigning a unique #0001-style numeric suffix on duplicate usernames) to access my saved profile.',
        '2. I can access, update, or reset only my own player profile, save slots, and learning progress, with confirmation prompts before resetting data.',
        '3. I feel confident that BYTEBOUND protects my privacy by avoiding unnecessary personal information (no passwords or personal emails required) while keeping my progress and rankings secure.'
      ]
    }
  ];

  factors.forEach(function (factor) {
    form.addGridItem()
      .setTitle(factor.title)
      .setHelpText(factor.help)
      .setRows(factor.rows)
      .setColumns(likertColumns)
      .setRequired(true);
  });

  // =========================================================================
  // SECTION 3: COMMENTS AND SUGGESTIONS
  // =========================================================================
  form.addPageBreakItem()
    .setTitle('Comments and Suggestions')
    .setHelpText('Your written feedback helps our BSIT-4R team improve BYTEBOUND: CITCS Quest.');

  form.addParagraphTextItem()
    .setTitle('Comments and Suggestions (Optional)')
    .setHelpText('Share any feedback, issues encountered, or suggestions for improving the game.')
    .setRequired(false);

  // =========================================================================
  // AUTO-LINKED GOOGLE SHEET + LIVE ISO/IEC 25010:2023 MEAN SUMMARY TAB
  // =========================================================================
  const ss = SpreadsheetApp.create('BYTEBOUND: CITCS Quest — Actual User Evaluation Responses');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();

  const summarySheet = ss.getSheets().find(function (s) {
    return !s.getName().toLowerCase().includes('form responses');
  }) || ss.insertSheet('ISO 25010 Summary');
  summarySheet.setName('ISO 25010 Summary');

  const respSheet = ss.getSheets().find(function (s) {
    return s.getName().toLowerCase().includes('form responses');
  });
  const rName = "'" + (respSheet ? respSheet.getName() : 'Form Responses 1').replace(/'/g, "''") + "'";

  // Helper: computes weighted mean of 1–5 ratings while strictly excluding N/A and blanks
  function meanFormula(rangeA1) {
    return (
      '=IFERROR(AVERAGE(ARRAYFORMULA(IF(' + rName + '!' + rangeA1 + '="", "", ' +
      'IFERROR(VALUE(LEFT(' + rName + '!' + rangeA1 + ', 1)), "")))), "")'
    );
  }

  // Helper: official PLMun-CITCS verbal interpretation scale
  function interpFormula(cellRef) {
    return (
      '=IF(' + cellRef + '="", "", ' +
      'IF(ROUND(' + cellRef + ',2)>=4.21, "Excellent", ' +
      'IF(ROUND(' + cellRef + ',2)>=3.41, "Very Good", ' +
      'IF(ROUND(' + cellRef + ',2)>=2.61, "Good", ' +
      'IF(ROUND(' + cellRef + ',2)>=1.81, "Fair", "Poor")))))'
    );
  }

  summarySheet.getRange('A1:C1').merge()
    .setValue('BYTEBOUND: CITCS Quest — ISO/IEC 25010:2023 Summary of Results (Actual Users)')
    .setFontWeight('bold')
    .setFontSize(12)
    .setBackground('#1B365D')
    .setFontColor('#FFFFFF');

  summarySheet.getRange('A2').setValue('Total Respondents (Target: 30 PLMUN IT Students)').setFontWeight('bold');
  summarySheet.getRange('B2').setFormula('=COUNTA(' + rName + '!B2:B)').setFontWeight('bold').setHorizontalAlignment('center');

  summarySheet.getRange('A4:C4')
    .setValues([['QUALITY CHARACTERISTIC', 'WEIGHTED MEAN', 'VERBAL INTERPRETATION']])
    .setFontWeight('bold')
    .setBackground('#D9E1F2')
    .setHorizontalAlignment('center');

  factors.forEach(function (factor, i) {
    const row = 5 + i;
    summarySheet.getRange(row, 1).setValue(factor.title + ' (3 indicators)');
    summarySheet.getRange(row, 2).setFormula(meanFormula(factor.colRange)).setNumberFormat('0.00').setHorizontalAlignment('center');
    summarySheet.getRange(row, 3).setFormula(interpFormula('B' + row)).setHorizontalAlignment('center');
  });

  const overallRow = 5 + factors.length; // Row 11
  summarySheet.getRange(overallRow, 1).setValue('OVERALL WEIGHTED MEAN (ALL 18 INDICATORS)').setFontWeight('bold').setBackground('#EDF2F7');
  summarySheet.getRange(overallRow, 2).setFormula(meanFormula('E2:V')).setNumberFormat('0.00').setFontWeight('bold').setHorizontalAlignment('center').setBackground('#EDF2F7');
  summarySheet.getRange(overallRow, 3).setFormula(interpFormula('B' + overallRow)).setFontWeight('bold').setHorizontalAlignment('center').setBackground('#EDF2F7');

  // Official rating scale legend for quick reference
  summarySheet.getRange('A13:C13')
    .setValues([['MEAN RANGE', 'VERBAL INTERPRETATION', 'SCORING RULE']])
    .setFontWeight('bold')
    .setBackground('#D9E1F2');
  summarySheet.getRange('A14:C18').setValues([
    ['4.21 – 5.00', 'Excellent', 'Valid 1–5 ratings only; N/A excluded from denominator'],
    ['3.41 – 4.20', 'Very Good', ''],
    ['2.61 – 3.40', 'Good', ''],
    ['1.81 – 2.60', 'Fair', ''],
    ['1.00 – 1.80', 'Poor', '']
  ]);

  summarySheet.setColumnWidth(1, 390);
  summarySheet.setColumnWidth(2, 160);
  summarySheet.setColumnWidth(3, 240);

  Logger.log('===============================================================');
  Logger.log('BYTEBOUND ACTUAL USER EVALUATION FORM CREATED SUCCESSFULLY!');
  Logger.log('Shareable Respondent Link: ' + form.getPublishedUrl());
  Logger.log('Form Editor Link:          ' + form.getEditUrl());
  Logger.log('Linked Sheet + Summary:    ' + ss.getUrl());
  Logger.log('===============================================================');
}
