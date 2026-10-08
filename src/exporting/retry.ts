import type { ExportJob } from './plan.ts';
/** Completed files are reused only for the same scene revision, settings and destination. */
export class ExportRetry {
    private scope = '';
    private completed = new Set<string>();
    private key(job: ExportJob) { return JSON.stringify(job); }
    prepare(scope: string) { if (scope !== this.scope) { this.scope = scope; this.completed.clear(); } }
    remaining(jobs: ExportJob[]) { return jobs.filter(job => !this.completed.has(this.key(job))); }
    complete(job: ExportJob) { this.completed.add(this.key(job)); }
    clear() { this.scope = ''; this.completed.clear(); }
}
