import {
  AppWindow,
  ArrowRight,
  Container,
  GitBranch,
  Pencil,
  RotateCcw,
  Sparkles,
  Timer,
} from 'lucide-react';
import siteStats from '../_generated/site-stats.json';
import './vivarium-landing.css';

type Lang = 'en' | 'ja';

const LAYER_ICONS = [AppWindow, Container, RotateCcw] as const;
const PERSONA_ICONS = [Timer, GitBranch, Sparkles, Pencil] as const;

const STRINGS = {
  en: {
    base: '/vivarium',
    numbers: {
      eyebrow: '// TODAY',
      items: [
        { value: String(siteStats.recipes), label: 'reproductions' },
        { value: String(siteStats.mcpTools), label: 'MCP tools' },
        { value: String(siteStats.layers), label: 'ways to run' },
        { value: String(siteStats.locales), label: 'site languages' },
      ],
    },
    layers: {
      eyebrow: '// HOW RECIPES RUN',
      heading: 'Each recipe uses the environment its bug needs.',
      sub: 'You don’t choose the environment. Each recipe already belongs to one of three layers.',
      cards: [
        {
          pill: 'L1',
          accent: 'teal' as const,
          title: 'In your browser.',
          body: 'Runs in the page through WebAssembly, with nothing to install. The first load can take a few tens of seconds while the runtime downloads.',
          runtimes: 'Pyodide · Ruby.wasm · formicarium',
        },
        {
          pill: 'L2',
          accent: 'violet' as const,
          title: 'In Docker.',
          body: 'Runs on your machine from a published image, with one `docker run`. For bugs that need real processes, files or services.',
          runtimes: 'Docker',
        },
        {
          pill: 'L3',
          accent: 'coral' as const,
          title: 'As a live preview.',
          body: 'A pull request’s whole application, opened in the browser so a reviewer can check the change by using it. Previews need a GitHub sign-in and are open only to invited people.',
          runtimes: 'Invitation required',
        },
      ],
    },
    personas: {
      eyebrow: '// WHERE TO START',
      heading: 'Pick what you want to do.',
      sub: 'Start with one recipe, or go straight to what you came for.',
      cards: [
        {
          micro: 'TRY IT',
          title: 'Run your first recipe',
          body: 'No install, no account. Open a recipe in your browser and read its verdict.',
          href: '/guide/getting-started',
        },
        {
          micro: 'SEARCH',
          title: 'Find a bug from an error',
          body: 'Paste an error message to get matching recipes.',
          href: '/repro/match',
        },
        {
          micro: 'AI AGENT',
          title: 'Connect your AI agent',
          body: `Use ${siteStats.mcpTools} MCP tools to search the catalogue and read verdicts from Claude Code, Cursor or Cline.`,
          href: '/guide/use-from-ai-agent',
        },
        {
          micro: 'CONTRIBUTE',
          title: 'Add a reproduction',
          body: 'Write a recipe for a bug you care about.',
          href: '/guide/write-your-first-reproduction',
        },
      ],
      arrow: 'Open',
    },
    cta: {
      eyebrow: '// SEE IT RUN',
      heading: `${siteStats.recipes} real bugs, ready to check.`,
      sub: 'Filter by language or search by text to find one you recognise.',
      primary: { label: 'Browse reproductions →', href: '/repro/' },
      ghost: { label: 'How it works', href: '/architecture' },
    },
  },
  ja: {
    base: '/vivarium/ja',
    numbers: {
      eyebrow: '// 現在',
      items: [
        { value: String(siteStats.recipes), label: '再現' },
        { value: String(siteStats.mcpTools), label: 'MCP ツール' },
        { value: String(siteStats.layers), label: '実行方法' },
        { value: String(siteStats.locales), label: 'サイトの言語' },
      ],
    },
    layers: {
      eyebrow: '// レシピの動かし方',
      heading: 'レシピはバグに合った環境で動きます。',
      sub: '環境を選ぶ必要はありません。各レシピは、3つのレイヤーのどれかにあらかじめ属しています。',
      cards: [
        {
          pill: 'L1',
          accent: 'teal' as const,
          title: 'ブラウザで動かす。',
          body: 'WebAssembly でページ内で動き、インストールは不要です。初回はランタイムのダウンロードに数十秒かかることがあります。',
          runtimes: 'Pyodide · Ruby.wasm · formicarium',
        },
        {
          pill: 'L2',
          accent: 'violet' as const,
          title: 'Docker で動かす。',
          body: '公開済みのイメージを使い、`docker run` の1回で手元で動きます。実際のプロセス、ファイル、サービスが必要なバグ向けです。',
          runtimes: 'Docker',
        },
        {
          pill: 'L3',
          accent: 'coral' as const,
          title: 'ライブプレビューで確かめる。',
          body: 'プルリクエストのアプリケーション全体をブラウザで開き、レビュアーが実際に使って変更を確認します。GitHub へのサインインが必要で、招待された人だけが開けます。',
          runtimes: '招待が必要',
        },
      ],
    },
    personas: {
      eyebrow: '// はじめ方',
      heading: 'やりたいことから選んでください。',
      sub: 'まず1つ動かしても、目的のページに直接進んでも構いません。',
      cards: [
        {
          micro: '試す',
          title: '最初のレシピを動かす',
          body: 'インストールもアカウントも不要です。ブラウザでレシピを開いて判定を読みます。',
          href: '/guide/getting-started',
        },
        {
          micro: '検索',
          title: 'エラーからバグを探す',
          body: 'エラーメッセージを貼り付けると、近いレシピが見つかります。',
          href: '/repro/match',
        },
        {
          micro: 'AI エージェント',
          title: 'AI エージェントをつなぐ',
          body: `${siteStats.mcpTools} 個の MCP ツールで、Claude Code、Cursor、Cline からカタログを検索し、判定を読めます。`,
          href: '/guide/use-from-ai-agent',
        },
        {
          micro: '貢献',
          title: '再現を追加する',
          body: '気になるバグのレシピを書きます。',
          href: '/guide/write-your-first-reproduction',
        },
      ],
      arrow: '開く',
    },
    cta: {
      eyebrow: '// 実物を見る',
      heading: `実際のバグ ${siteStats.recipes} 件を、すぐに確かめられます。`,
      sub: '言語で絞り込んだり文字列で検索したりして、心当たりのあるバグを探せます。',
      primary: { label: '再現一覧を見る →', href: '/repro/' },
      ghost: { label: '仕組み', href: '/architecture' },
    },
  },
} as const;

export function VivariumNumbers({ lang = 'en' }: { lang?: Lang } = {}) {
  const s = STRINGS[lang];
  return (
    <section className="v-land-numbers" aria-labelledby="v-numbers-eyebrow">
      <div className="v-land-numbers__inner">
        <p id="v-numbers-eyebrow" className="v-land__eyebrow">
          {s.numbers.eyebrow}
        </p>
        <div className="v-land-numbers__grid">
          {s.numbers.items.map((item, i) => (
            <div key={i} className="v-land-numbers__cell">
              <div className="v-land-numbers__value">{item.value}</div>
              <div className="v-land-numbers__label">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function VivariumLayers({ lang = 'en' }: { lang?: Lang } = {}) {
  const s = STRINGS[lang];
  return (
    <section className="v-land-layers" aria-labelledby="v-layers-heading">
      <div className="v-land-layers__inner">
        <p className="v-land__eyebrow">{s.layers.eyebrow}</p>
        <h2 id="v-layers-heading" className="v-land__heading">
          {s.layers.heading}
        </h2>
        <p className="v-land__sub">{s.layers.sub}</p>
        <div className="v-land-layers__grid">
          {s.layers.cards.map((card, i) => {
            const Icon = LAYER_ICONS[i];
            return (
              <article key={i} className="v-land-layer">
                <div className="v-land-layer__head">
                  <Icon
                    className={`v-land-layer__icon v-land-layer__icon--${card.accent}`}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span
                    className={`v-land-layer__pill v-land-layer__pill--${card.accent}`}
                  >
                    {card.pill}
                  </span>
                </div>
                <h3 className="v-land-layer__title">{card.title}</h3>
                <p className="v-land-layer__body">{card.body}</p>
                <div className="v-land-layer__runtimes">{card.runtimes}</div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function VivariumPersonas({ lang = 'en' }: { lang?: Lang } = {}) {
  const s = STRINGS[lang];
  return (
    <section className="v-land-personas" aria-labelledby="v-personas-heading">
      <div className="v-land-personas__inner">
        <p className="v-land__eyebrow">{s.personas.eyebrow}</p>
        <h2 id="v-personas-heading" className="v-land__heading">
          {s.personas.heading}
        </h2>
        <p className="v-land__sub">{s.personas.sub}</p>
        <div className="v-land-personas__grid">
          {s.personas.cards.map((card, i) => {
            const Icon = PERSONA_ICONS[i];
            return (
              <a
                key={i}
                className="v-land-persona"
                href={`${s.base}${card.href}`}
              >
                <div className="v-land-persona__head">
                  <Icon
                    className="v-land-persona__icon"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span className="v-land-persona__micro">{card.micro}</span>
                </div>
                <h3 className="v-land-persona__title">{card.title}</h3>
                <p className="v-land-persona__body">{card.body}</p>
                <span className="v-land-persona__cta">
                  {s.personas.arrow}
                  <ArrowRight
                    className="v-land-persona__arrow"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function VivariumCtaBand({ lang = 'en' }: { lang?: Lang } = {}) {
  const s = STRINGS[lang];
  return (
    <section className="v-land-cta" aria-labelledby="v-cta-heading">
      <div className="v-land-cta__inner">
        <p className="v-land__eyebrow">{s.cta.eyebrow}</p>
        <h2 id="v-cta-heading" className="v-land-cta__heading">
          {s.cta.heading}
        </h2>
        <p className="v-land-cta__sub">{s.cta.sub}</p>
        <div className="v-land-cta__buttons">
          <a
            className="v-land-cta__btn v-land-cta__btn--primary"
            href={`${s.base}${s.cta.primary.href}`}
          >
            {s.cta.primary.label}
          </a>
          <a
            className="v-land-cta__btn v-land-cta__btn--ghost"
            href={`${s.base}${s.cta.ghost.href}`}
          >
            {s.cta.ghost.label}
          </a>
        </div>
      </div>
    </section>
  );
}
