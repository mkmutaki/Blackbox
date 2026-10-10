import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

export interface PasswordInputProps extends Omit<React.ComponentProps<"input">, "type"> {
  /** Block paste/drop/autofill-by-paste so the user must type the value themselves. */
  blockPaste?: boolean
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, blockPaste, onPaste, onDrop, onContextMenu, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false)

    const preventPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault()
    }

    const preventDrop = (e: React.DragEvent<HTMLInputElement>) => {
      e.preventDefault()
    }

    return (
      <div className="relative">
        <Input
          {...props}
          ref={ref}
          type={visible ? "text" : "password"}
          onPaste={blockPaste ? preventPaste : onPaste}
          onDrop={blockPaste ? preventDrop : onDrop}
          className={cn("pr-10", className)}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    )
  }
)
PasswordInput.displayName = "PasswordInput"

export { PasswordInput }
