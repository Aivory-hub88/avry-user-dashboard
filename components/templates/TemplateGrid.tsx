import React from "react";
import TemplateCard from "./TemplateCard";
import { Template } from "./template-data";

export default function TemplateGrid({ templates }: { templates: Template[] }) {
  if (templates.length === 0) {
    return (
      <div className="w-full text-center py-20 text-[#a1a1aa] font-light">
        No templates found matching your criteria.
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-medium text-white mb-6">Popular templates</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {templates.map((template) => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </div>
    </div>
  );
}
