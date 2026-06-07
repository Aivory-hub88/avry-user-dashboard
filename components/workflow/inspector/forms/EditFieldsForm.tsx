'use client';
import React from 'react';
import type { EditFieldsConfig } from '@/types/workflow-node';
import { KeyValueList } from '../InspectorInputs';

interface Props { config: EditFieldsConfig; onChange: (c: EditFieldsConfig) => void; errors: Record<string, string>; }

export default function EditFieldsForm({ config, onChange, errors }: Props) {
  return <KeyValueList label="Fields to set" items={config.fields} onChange={(fields) => onChange({ ...config, fields })} addLabel="+ Add field" />;
}
