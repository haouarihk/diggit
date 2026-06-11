import { RepositoryTreeEntry } from "@/lib/api";
import { Archive, Braces, Code2, Database, File, FileText, Folder, FolderOpen, ImageIcon, Music, Video } from "lucide-react"



export const README_ENTRY = { extension: "md", kind: "file", name: "README.md" } as const;
export function FileTypeIcon({ entry }: { entry: Pick<RepositoryTreeEntry, "extension" | "name"> }) {
    const extension = (entry.extension || entry.name.split(".").pop() || "").toLowerCase();

    if (["md", "mdx", "txt", "rst"].includes(extension)) return <FileText className="h-4 w-4" aria-hidden="true" />;
    if (["ts", "tsx", "js", "jsx", "rs", "go", "py", "css", "html", "sh"].includes(extension)) {
        return <Code2 className="h-4 w-4" aria-hidden="true" />;
    }
    if (["json", "lock", "toml", "yml", "yaml"].includes(extension)) return <Braces className="h-4 w-4" aria-hidden="true" />;
    if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(extension)) return <ImageIcon className="h-4 w-4" aria-hidden="true" />;
    if (["mp4", "mov", "webm", "mkv"].includes(extension)) return <Video className="h-4 w-4" aria-hidden="true" />;
    if (["mp3", "wav", "ogg", "flac"].includes(extension)) return <Music className="h-4 w-4" aria-hidden="true" />;
    if (["zip", "tar", "gz", "rar", "7z"].includes(extension)) return <Archive className="h-4 w-4" aria-hidden="true" />;
    if (["sql", "db", "sqlite"].includes(extension)) return <Database className="h-4 w-4" aria-hidden="true" />;
    return <File className="h-4 w-4" aria-hidden="true" />;
}


export default function IconForFile({ active = false, entry }: { active?: boolean; entry: Pick<RepositoryTreeEntry, "extension" | "kind" | "name"> }) {
    return (
        <span
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${active ? "border-[#0969da] bg-white text-[#0969da]" : "border-[#d0d7de] bg-[#f6f8fa] text-[#59636e]"
                }`}
        >
            {entry.kind === "directory" ? (
                active ? (
                    <FolderOpen className="h-4 w-4" aria-hidden="true" />
                ) : (
                    <Folder className="h-4 w-4" aria-hidden="true" />
                )
            ) : (
                <FileTypeIcon entry={entry} />
            )}
        </span>
    );
}
