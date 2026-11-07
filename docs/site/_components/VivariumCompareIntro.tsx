import { ClipboardPaste, Link2, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import './vivarium-compare-intro.css';

function renderInlineCode(text: string): ReactNode {
  return text
    .split('`')
    .map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part));
}

type Lang = 'en' | 'ja';

const STRINGS = {
  en: {
    eyebrow: '// THREE WAYS TO LOAD A VERDICT',
    heading: 'Bring a verdict bundle, three ways.',
    sub: 'Every comparison starts with a Contract v1 verdict from your branch fix. Use whichever path fits how the bundle reached you.',
    cards: [
      {
        micro: 'DROP',
        title: 'Drop the bundle',
        body: 'Drag a `branch-fix-verdict.yml` artifact (zip) or a `verdict.json` onto the page. The zip also holds the original verdict when one is deployed.',
      },
      {
        micro: 'PASTE',
        title: 'Paste verdict JSON',
        body: 'Paste the branch-fix and (optionally) original `verdict.json` payloads directly. Useful when CI logs are the only handle you have.',
      },
      {
        micro: 'SLUG + URL',
        title: 'Enter the recipe path',
        body: 'For a Layer 2 recipe, enter its path (e.g. `bash/local-shadows-exit`) to load the deployed snapshot, then add your branch-fix verdict.',
      },
    ],
  },
  ja: {
    eyebrow: '// VERDICT を読み込む 3 つの経路',
    heading: 'verdict バンドルを、3 つのうち 1 つで持参。',
    sub: '比較はすべて、自分のブランチ修正から得た Contract v1 verdict から始まる。手元にある形に合った経路を選ぶ。',
    cards: [
      {
        micro: 'DROP',
        title: 'バンドルをドロップ',
        body: '`branch-fix-verdict.yml` のアーティファクト（zip）または `verdict.json` をページにドロップ。デプロイ済みの判定がある場合は、zip に元の判定も入っている。',
      },
      {
        micro: 'PASTE',
        title: 'verdict JSON を貼り付け',
        body: 'branch-fix と（任意で）オリジナルの `verdict.json` を直接貼り付け。CI ログしか手がかりがない時に有用。',
      },
      {
        micro: 'SLUG + URL',
        title: 'レシピのパスを入力',
        body: 'Layer 2 のレシピのパス（例: `bash/local-shadows-exit`）を入れてデプロイ済みスナップショットを読み込み、branch-fix の判定を追加する。',
      },
    ],
  },
} as const;

const ICONS = [Upload, ClipboardPaste, Link2] as const;

export function VivariumCompareIntro({ lang = 'en' }: { lang?: Lang } = {}) {
  const s = STRINGS[lang];
  return (
    <section className="v-compare-intro" aria-labelledby="v-compare-intro-h">
      <div className="v-compare-intro__inner">
        <p className="v-compare-intro__eyebrow">{s.eyebrow}</p>
        <h2 id="v-compare-intro-h" className="v-compare-intro__heading">
          {s.heading}
        </h2>
        <p className="v-compare-intro__sub">{s.sub}</p>
        <div className="v-compare-intro__grid">
          {s.cards.map((card, i) => {
            const Icon = ICONS[i];
            return (
              <article key={i} className="v-compare-intro__card">
                <div className="v-compare-intro__card-head">
                  <Icon
                    className="v-compare-intro__icon"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span className="v-compare-intro__micro">{card.micro}</span>
                </div>
                <h3 className="v-compare-intro__card-title">{card.title}</h3>
                <p className="v-compare-intro__card-body">
                  {renderInlineCode(card.body)}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
