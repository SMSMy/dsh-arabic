# Ready-to-submit entry for the curated catalog

The visual plugin market (dshmarket) only installs plugins listed in the curated
registry [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).
One YAML file per plugin is the whole submission:

```
data/plugins/SMSMy__dsh-arabic.yml
```

Copy [`SMSMy__dsh-arabic.yml`](SMSMy__dsh-arabic.yml) into that path in a fork of
the registry and open a pull request. The site and the market pick the entry up
automatically (usually within a day). The entry must point at a repository whose
`package.json` declares `dsh.bundle` — this one does.

Submit **after** the package is published to npm, so the registry's npm mapping
resolves.
