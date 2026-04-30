# essay-ai-suite 1Panel Install Notes

Generated local app package:

```text
services/essay-ai-suite/releases/essay-ai-suite-1panel-local-app-0.1.0.tar.gz
```

Local app folder:

```text
services/essay-ai-suite/1panel/apps/essay-ai-suite
```

Install target on a 1Panel host:

```text
/opt/1panel/resource/apps/local/essay-ai-suite
```

The 1Panel package uses this image:

```text
ghcr.io/zhangyufei820/essay-ai-suite:0.1.0
```

If the GHCR package is private, log in on the 1Panel host before installing:

```bash
docker login ghcr.io -u zhangyufei820
```

Use a GitHub token with `read:packages` permission as the password. If the package is set to public in GitHub Packages, no login is required.
