export interface ConflictErrorBody {
    type: string;
    title: string;
    status: number;
    code: string;
    detail: string;
    resource?: Record<string, string> | undefined;
    retryable: boolean;
}
