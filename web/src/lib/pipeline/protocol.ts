import type { CaseMetadata, CorpusSummary, ProcessedDocument, SearchOptions, SearchResult, Model, Contribution, TokenStages, ScoringParameters } from './types';
import type { Evaluation } from './evaluation';
/** Every request/reply carries the caller's id. Progress belongs to load request.
 * Send inspect for a full document; ready intentionally contains only a summary. */
export type PipelineRequest = {
    id: string;
    type: 'load';
    zipUrl: string;
    assetBase: string;
    ocr?: boolean;
    cases?: CaseMetadata[];
    force?: boolean;
} | {
    id: string;
    type: 'search';
    query: string;
    options?: SearchOptions;
} | {
    id: string;
    type: 'explain';
    query: string;
    documentId: string;
    model?: Model;
    stemming?: boolean;
    parameters?: ScoringParameters;
} | {
    id: string;
    type: 'evaluate';
    model?: Model;
    stemming?: boolean;
} | {
    id: string;
    type: 'inspect';
    documentId: string;
} | {
    id: string;
    type: 'pdf';
    documentId: string;
} | {
    id: string;
    type: 'preprocess';
    text: string;
};
export type PipelineResponse = {
    id: string;
    type: 'progress';
    event: 'stage' | 'document-started' | 'document-finished';
    stage: string;
    documentId?: string;
    completed: number;
    total: number;
    pages: number;
    tokens: number;
    elapsed: number;
} | {
    id: string;
    type: 'warning';
    kind: 'storage' | 'ocr';
    message: string;
} | {
    id: string;
    type: 'ready';
    summary: CorpusSummary;
} | {
    id: string;
    type: 'search';
    results: SearchResult[];
    parsed: { terms: string[]; phrases: string[][]; excluded: string[] };
} | {
    id: string;
    type: 'explain';
    contributions: Contribution[];
} | {
    id: string;
    type: 'evaluate';
    evaluation: Evaluation;
} | {
    id: string;
    type: 'inspect';
    document: ProcessedDocument;
} | {
    id: string;
    type: 'preprocess';
    stages: TokenStages;
} | {
    id: string;
    type: 'pdf';
    bytes: ArrayBuffer;
} | {
    id: string;
    type: 'error';
    message: string;
};
