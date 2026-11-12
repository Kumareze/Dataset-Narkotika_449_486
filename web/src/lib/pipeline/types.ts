/** All ranges are half-open UTF-16 offsets. PDF boxes use unrotated PDF user
 * space (bottom-left origin), never CSS pixels. Sub-box widths are proportional
 * to character offsets: pdf.js text items do not expose individual glyph widths.
 * A token can have multiple sources (line breaks, shabu-shabu, golongan I).
 * Its term is normalized/stemmed; source text always remains verbatim. */
export interface Box {
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface RawItem extends Box {
    id: number;
    text: string;
    transform: number[];
    horizontal: boolean;
    start: number;
    end: number;
}
export interface RawPage {
    page: number;
    width: number;
    height: number;
    items: RawItem[];
}
export interface SourceRange extends Box {
    itemId: number;
    start: number;
    end: number;
    text: string;
}
export interface Token {
    term: string;
    normalized: string;
    start: number;
    end: number;
    sources: SourceRange[];
}
export interface RemovedLine {
    page: number;
    text: string;
    itemIds: number[];
    reason: 'watermark' | 'footer' | 'disclaimer' | 'non-horizontal';
}
export const ZONES = ['kepala', 'tuntutan', 'dakwaan', 'pertimbangan', 'amar'] as const;
export type Zone = typeof ZONES[number];
export type SectionName = Zone | 'penutup';
export interface Section {
    start: number;
    end: number;
    text: string;
    trigger: string;
    found: boolean;
}
export type Sections = Record<SectionName, Section>;
export type CaseMetadata = Record<string, string | number | null>;
export interface ProcessedDocument {
    id: string;
    fileName: string;
    pages: RawPage[];
    text: string;
    removedLines: RemovedLine[];
    sections: Sections;
    attributes: CaseMetadata;
    tokens: Token[];
    zoneTokens: Record<Zone, string[]>;
    needsOcr: boolean;
    timings: Record<string, number>;
}
export interface PipelineOptions {
    stemming?: boolean;
    stopwords?: boolean;
}
export interface TokenStages {
    lowercase: string;
    normalized: string;
    tokens: string[];
    afterStopwords: string[];
    afterStemming: string[];
}
export type Model = 'BM25' | 'BM25F' | 'TF-IDF' | 'Boolean';
export interface ScoringParameters {
    k1?: number;
    b?: number;
    zoneWeights?: Partial<Record<Zone, number>>;
}
export interface SearchOptions extends PipelineOptions, ScoringParameters {
    model?: Model;
    k?: number;
    filters?: Record<string, string>;
}
export interface Match {
    term: string;
    normalized: string;
    start: number;
    end: number;
    rectangles: SourceRange[];
}
export interface Passage {
    text: string;
    start: number;
    end: number;
    page: number;
    highlights: {
        start: number;
        end: number;
        term: string;
    }[];
}
export interface SearchResult {
    id: string;
    caseNumber: string;
    score: number;
    model: Model;
    passage: Passage;
    matches: Match[];
    rectangles: SourceRange[];
}
export interface Contribution {
    term: string;
    tf: number;
    df: number;
    idf: number;
    lengthNormalization: number;
    contribution: number;
    zones: {
        zone: Zone;
        tf: number;
        weight: number;
        lengthNormalization: number;
        weightedTf: number;
    }[];
}
export interface IndexStatistics {
    vocabularySize: number;
    postings: number;
    positions: number;
    docLength: {
        min: number;
        max: number;
        avg: number;
    };
    zipf: {
        term: string;
        rank: number;
        frequency: number;
    }[];
    rawBytes: number;
    gapVariableBytes: number;
}
export interface CorpusSummary {
    version: string;
    documents: {
        id: string;
        fileName: string;
        pages: number;
        needsOcr: boolean;
        amarFound: boolean;
        tokens: number;
    }[];
    statistics: IndexStatistics;
    timings: Record<string, number>;
    cached: boolean;
}
