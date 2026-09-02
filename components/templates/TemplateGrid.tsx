import React from "react";
import { useTranslations } from "next-intl";
import TemplateCard from "./TemplateCard";
import { Template } from "./template-data";

export default function TemplateGrid({ templates }: { templates: Template[] }) {
  const t = useTranslations("templates");
  if (templates.length === 0) {
    return (
      <div className="w-full text-center py-20 text-[#a1a1aa] font-light">
        {t("noResults")}
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 500, color: '#fff', margin: '0 0 16px', lineHeight: 1.3 }}>{t("popularTemplates")}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {templates.map((template) => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </div>
    </div>
  );
}
