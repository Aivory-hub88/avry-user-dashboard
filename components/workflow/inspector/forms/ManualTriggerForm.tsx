'use client';
import React from 'react';
import { InspectorInfoBox } from '../InspectorInputs';

export default function ManualTriggerForm() {
  return <InspectorInfoBox message="This workflow is triggered manually from the Aivory dashboard or via the Run button." />;
}
