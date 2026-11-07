export type Lang = 'en' | 'ja';

export interface Strings {
  inputSection: string;
  dropPrompt: string;
  dropHint: string;
  orPickFile: string;
  acceptHint: string;
  pasteSection: string;
  pasteOriginal: string;
  pasteBranch: string;
  pasteApply: string;
  slugLabel: string;
  slugPlaceholder: string;
  slugHelp: string;
  expectedLabel: string;
  expectedFailDesc: string;
  expectedPassDesc: string;
  loading: string;
  fetchOriginal: string;
  refetchOriginal: string;
  clear: string;
  comparisonHeader: string;
  originalLabel: string;
  branchLabel: string;
  noOriginalDeployed: string;
  expectedMatchYes: string;
  expectedMatchNo: string;
  evidenceVerdict: string;
  evidenceExit: string;
  evidenceDuration: string;
  evidenceImageTag: string;
  evidenceImageDigest: string;
  evidenceCapturedAt: string;
  evidenceStdout: string;
  evidenceStderr: string;
  evidenceMissing: string;
  evidenceEmpty: string;
  errorTitle: string;
  errorAt: (path: string) => string;
  fetchFailed: (url: string) => string;
  parseFailed: string;
  zipMissingFiles: string;
  helpHeader: string;
  helpStep1: string;
  helpStep2: string;
  helpStep3: string;
  helpStep4: string;
  workflowDocs: string;
  semanticsHeader: string;
  semanticsBody: string;
  durationMsSuffix: string;
}

export const STRINGS: Record<Lang, Strings> = {
  en: {
    inputSection: '// 01 · LOAD VERDICTS',
    dropPrompt: 'Drop a verdict bundle here',
    dropHint:
      '`.zip` from a workflow run, or a single `branch-fix-verdict.json` / `original-verdict.json`.',
    orPickFile: 'or pick a file',
    acceptHint: 'Accepted: `.zip`, `.json`',
    pasteSection: '// 02 · PASTE FALLBACK',
    pasteOriginal: 'original-verdict.json',
    pasteBranch: 'branch-fix-verdict.json',
    pasteApply: 'Apply pasted JSON',
    slugLabel: 'Recipe slug',
    slugPlaceholder: 'e.g. bash-local-shadows-exit',
    slugHelp:
      'The slug of a Layer 2 recipe. The button loads its deployed snapshot as the original side.',
    expectedLabel: 'Expected branch-fix verdict',
    expectedFailDesc:
      'unreproduced — bug does NOT reproduce on the fix (typical "fix works")',
    expectedPassDesc:
      'reproduced — bug still reproduces on the fix (regression check)',
    loading: 'Loading…',
    fetchOriginal: 'Fetch deployed original',
    refetchOriginal: 'Re-fetch deployed original',
    clear: 'Clear',
    comparisonHeader: '// 03 · COMPARISON',
    originalLabel: 'Original (deployed)',
    branchLabel: 'Branch-fix',
    noOriginalDeployed:
      'No deployed snapshot for this slug. The original side is empty; comparing against the branch-fix only.',
    expectedMatchYes: 'matches expected',
    expectedMatchNo: 'does NOT match expected',
    evidenceVerdict: 'verdict',
    evidenceExit: 'exit code',
    evidenceDuration: 'duration',
    evidenceImageTag: 'image tag',
    evidenceImageDigest: 'image digest',
    evidenceCapturedAt: 'captured at',
    evidenceStdout: 'stdout',
    evidenceStderr: 'stderr (tail)',
    evidenceMissing: 'no verdict loaded on this side',
    evidenceEmpty: '(empty)',
    errorTitle: 'Validation error',
    errorAt: (path) => `at ${path}`,
    fetchFailed: (url) => `Could not fetch ${url}. Falling back to paste.`,
    parseFailed: 'Could not parse JSON. Falling back to paste.',
    zipMissingFiles:
      'The dropped zip did not contain branch-fix-verdict.json or original-verdict.json.',
    helpHeader: '// HOW TO PRODUCE A BUNDLE',
    helpStep1:
      'Build and publish your branch-fix Docker image to a registry the GitHub Actions runner can pull from.',
    helpStep2:
      'Run `gh workflow run branch-fix-verdict.yml -f slug=<slug> -f branch_image=<ref>`. The workflow lives at `.github/workflows/branch-fix-verdict.yml`.',
    helpStep3:
      'Download the artefact named `branch-fix-verdict-<slug>-<run_id>` from the run page.',
    helpStep4:
      'Drop the zip onto this page. It holds the original verdict too when one is deployed.',
    workflowDocs: 'Pipeline spec → /vivarium/spec/branch-fix-pipeline',
    semanticsHeader: '// VERDICT SEMANTICS',
    semanticsBody:
      '`reproduced` means the upstream bug was reproduced; `unreproduced` means it was not. A working branch-fix flips the verdict from `reproduced` to `unreproduced`.',
    durationMsSuffix: 'ms',
  },
  ja: {
    inputSection: '// 01 · VERDICT を読み込む',
    dropPrompt: 'verdict バンドルをここにドロップ',
    dropHint:
      'ワークフロー実行から取得した `.zip`、または `branch-fix-verdict.json` / `original-verdict.json` 単体。',
    orPickFile: 'またはファイルを選択',
    acceptHint: '受け付ける形式: `.zip`、`.json`',
    pasteSection: '// 02 · ペースト経由',
    pasteOriginal: 'original-verdict.json',
    pasteBranch: 'branch-fix-verdict.json',
    pasteApply: 'ペーストした JSON を適用',
    slugLabel: 'レシピ slug',
    slugPlaceholder: '例: bash-local-shadows-exit',
    slugHelp:
      'Layer 2 レシピの slug。ボタンでデプロイ済みスナップショットを元の判定として読み込む。',
    expectedLabel: '期待する branch-fix の verdict',
    expectedFailDesc:
      'unreproduced — 修正によりバグが再現しなくなる (典型的な「修正成立」)',
    expectedPassDesc:
      'reproduced — 修正後もバグが再現する (リグレッション確認)',
    loading: '読み込み中…',
    fetchOriginal: 'デプロイ済みオリジナルを取得',
    refetchOriginal: 'デプロイ済みオリジナルを再取得',
    clear: 'クリア',
    comparisonHeader: '// 03 · 比較',
    originalLabel: 'オリジナル (デプロイ済み)',
    branchLabel: 'Branch-fix',
    noOriginalDeployed:
      'この slug にはデプロイ済みスナップショットがない。オリジナル側は空のまま、branch-fix だけを表示している。',
    expectedMatchYes: '期待値と一致',
    expectedMatchNo: '期待値と不一致',
    evidenceVerdict: 'verdict',
    evidenceExit: 'exit コード',
    evidenceDuration: '所要時間',
    evidenceImageTag: 'image タグ',
    evidenceImageDigest: 'image ダイジェスト',
    evidenceCapturedAt: '取得日時',
    evidenceStdout: 'stdout',
    evidenceStderr: 'stderr (末尾)',
    evidenceMissing: 'この側にはまだ verdict が読み込まれていない',
    evidenceEmpty: '(空)',
    errorTitle: 'バリデーションエラー',
    errorAt: (path) => `${path} の位置で`,
    fetchFailed: (url) =>
      `${url} を取得できなかった。ペースト経由にフォールバック。`,
    parseFailed: 'JSON のパースに失敗した。ペースト経由にフォールバック。',
    zipMissingFiles:
      'ドロップされた zip に branch-fix-verdict.json も original-verdict.json も含まれていなかった。',
    helpHeader: '// バンドルを生成する手順',
    helpStep1:
      'GitHub Actions ランナーが認証なしで pull できるレジストリに、自分の branch-fix Docker イメージをビルドして publish する。',
    helpStep2:
      '`gh workflow run branch-fix-verdict.yml -f slug=<slug> -f branch_image=<ref>` を実行する。ワークフローは `.github/workflows/branch-fix-verdict.yml` にある。',
    helpStep3:
      '実行ページから `branch-fix-verdict-<slug>-<run_id>` という名前のアーティファクトをダウンロードする。',
    helpStep4:
      'その zip をこのページにドロップする。デプロイ済みの判定がある場合は、元の判定も zip に入っている。',
    workflowDocs: 'パイプライン仕様 → /vivarium/ja/spec/branch-fix-pipeline',
    semanticsHeader: '// VERDICT のセマンティクス',
    semanticsBody:
      '`reproduced` は アップストリームのバグが再現したことを意味する。`unreproduced` は再現しなかったことを意味する。修正が機能している branch-fix は verdict を `reproduced` から `unreproduced` に反転させる。',
    durationMsSuffix: 'ms',
  },
};
