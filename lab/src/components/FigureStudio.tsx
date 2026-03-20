import type { FigureTemplate } from "../types";

type FigureStudioProps = {
  templates: FigureTemplate[];
  activeTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  onExportPng: () => void;
  onExportSvg: () => void;
};

export function FigureStudio({
  templates,
  activeTemplateId,
  onSelectTemplate,
  onExportPng,
  onExportSvg,
}: FigureStudioProps) {
  return (
    <section className="figure-studio">
      <div className="figure-studio__head">
        <div>
          <p className="eyebrow">Figure Studio</p>
          <h3>Export-ready presets</h3>
        </div>
        <div className="figure-studio__actions">
          <button type="button" onClick={onExportPng}>
            Download PNG
          </button>
          <button type="button" className="secondary" onClick={onExportSvg}>
            Download SVG
          </button>
        </div>
      </div>

      <div className="figure-template-grid">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            className={`figure-template ${template.id === activeTemplateId ? "is-active" : ""}`}
            onClick={() => onSelectTemplate(template.id)}
          >
            <strong>{template.title}</strong>
            <span>{template.description}</span>
            <small>
              {template.aspectRatio} · {template.view}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}
