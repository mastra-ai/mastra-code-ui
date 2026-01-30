export class ToolError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ToolError";
    }
}
export function isViewArgs(args: any): boolean {
    return (typeof args.path === "string" &&
        (args.view_range === undefined ||
            (Array.isArray(args.view_range) &&
                args.view_range.length === 2 &&
                args.view_range.every((n: any) => typeof n === "number"))));
}
export function isCreateArgs(args: any): boolean {
    return typeof args.path === "string" && typeof args.file_text === "string";
}
export function isStrReplaceArgs(args: any): boolean {
    return (typeof args.path === "string" &&
        typeof args.old_str === "string" &&
        (args.new_str === undefined || typeof args.new_str === "string"));
}
export function isInsertArgs(args: any): boolean {
    return (typeof args.path === "string" &&
        typeof args.insert_line === "number" &&
        typeof args.new_str === "string");
}
export function isUndoEditArgs(args: any): boolean {
    return typeof args.path === "string";
}
