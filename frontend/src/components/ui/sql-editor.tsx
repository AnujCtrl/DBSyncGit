import * as React from "react";
import Editor from "@monaco-editor/react";

interface SQLEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  title?: string;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function SQLEditor({
  value,
  onChange,
  title,
  className = "",
}: SQLEditorProps) {
  return (
    <div className={className}>
      {title && (
        <div className="mb-2 text-sm font-medium text-muted-foreground">
          {title}
        </div>
      )}
      <div className="border rounded-md overflow-hidden h-[100px]">
        <Editor
          defaultLanguage="sql"
          value={value}
          onChange={onChange}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 14,
            lineNumbers: "on",
            roundedSelection: false,
            wordWrap: "on",
            folding: true,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 3,
            renderLineHighlight: "none",
            scrollbar: {
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
          }}
        />
      </div>
    </div>
  );
}
