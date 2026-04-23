export function assertSecureTlsConfiguration(): void {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new Error(
      "Insecure TLS configuration detected. Remove NODE_TLS_REJECT_UNAUTHORIZED=0 and fix the upstream certificate chain."
    )
  }
}
