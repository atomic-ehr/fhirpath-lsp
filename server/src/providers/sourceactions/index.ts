import { Connection } from 'vscode-languageserver';
import { FHIRPathService } from '../../parser/FHIRPathService';
import { FormatterService } from '../../services/FormatterService';
import { 
  CodeActionRegistration,
  FHIRPathCodeActionKind,
} from '../../types/CodeActionTypes';

import { FormatDocumentProvider } from './FormatDocumentProvider';
import { OptimizePerformanceProvider } from './OptimizePerformanceProvider';
import { OrganizeCodeProvider } from './OrganizeCodeProvider';
import { RemoveUnusedProvider } from './RemoveUnusedProvider';

export function createSourceActionProviders(
  connection: Connection,
  fhirPathService: FHIRPathService
): CodeActionRegistration[] {
  const formatterService = new FormatterService(fhirPathService);
  
  const registrations: CodeActionRegistration[] = [
    {
      kinds: [
        FHIRPathCodeActionKind.Source,
        FHIRPathCodeActionKind.SourceFormat,
      ],
      provider: new FormatDocumentProvider(formatterService),
      priority: 100,
    },
    {
      kinds: [
        FHIRPathCodeActionKind.Source,
        FHIRPathCodeActionKind.RefactorOptimize,
      ],
      provider: new OptimizePerformanceProvider(fhirPathService),
      priority: 90,
    },
    {
      kinds: [
        FHIRPathCodeActionKind.Source,
        FHIRPathCodeActionKind.SourceOrganize,
      ],
      provider: new OrganizeCodeProvider(),
      priority: 80,
    },
    {
      kinds: [
        FHIRPathCodeActionKind.Source,
        FHIRPathCodeActionKind.SourceRemoveUnused,
      ],
      provider: new RemoveUnusedProvider(),
      priority: 70,
    },
  ];

  connection?.console?.log(`Created ${registrations.length} source action providers`);
  
  return registrations;
}
