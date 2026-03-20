import { useEffect, useRef } from "react";

import type { ManifestTrack } from "../types";

type StoryPanelProps = {
  track: ManifestTrack;
  activeChapterId: string;
  onSelectChapter: (chapterId: string) => void;
  currentTimeLabel: string;
};

export function StoryPanel({
  track,
  activeChapterId,
  onSelectChapter,
  currentTimeLabel,
}: StoryPanelProps) {
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (best?.target instanceof HTMLElement) {
          onSelectChapter(best.target.dataset.chapterId ?? track.chapters[0].id);
        }
      },
      { rootMargin: "-20% 0px -40% 0px", threshold: [0.25, 0.5, 0.75] },
    );

    for (const chapter of track.chapters) {
      const node = sectionRefs.current[chapter.id];
      if (node) {
        observer.observe(node);
      }
    }

    return () => observer.disconnect();
  }, [onSelectChapter, track]);

  return (
    <aside className="story-panel">
      <div className="story-panel__hero">
        <p className="eyebrow">{track.label}</p>
        <h2>{track.title}</h2>
        <p className="story-panel__subtitle">{track.subtitle}</p>
        <p className="story-panel__summary">{track.heroSummary}</p>
        <div className="story-panel__meta">
          <span>Current frame</span>
          <strong>{currentTimeLabel}</strong>
        </div>
      </div>

      <div className="story-panel__preview-grid">
        <img src="assets/preview-hero.png" alt="Scene preview" />
        <img src="assets/preview-timeline.png" alt="Timeline preview" />
      </div>

      <div className="story-panel__sections">
        {track.chapters.map((chapter) => {
          const active = chapter.id === activeChapterId;
          return (
            <section
              key={chapter.id}
              ref={(node) => {
                sectionRefs.current[chapter.id] = node;
              }}
              data-chapter-id={chapter.id}
              className={`story-section ${active ? "is-active" : ""}`}
            >
              <button
                type="button"
                className="story-section__button"
                onClick={() => {
                  onSelectChapter(chapter.id);
                  sectionRefs.current[chapter.id]?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
              >
                <span className="story-section__eyebrow">{chapter.eyebrow}</span>
                <span className="story-section__title">{chapter.title}</span>
              </button>

              <p className="story-section__summary">{chapter.summary}</p>

              {active ? (
                <div className="story-section__details">
                  <div className="why-matters">
                    <p className="why-matters__label">Why it matters</p>
                    <p>{chapter.whyItMatters}</p>
                  </div>

                  <details className="evidence-drawer" open>
                    <summary>Evidence Drawer</summary>
                    <ul>
                      {chapter.evidence.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
