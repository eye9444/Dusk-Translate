## Release candidate

Version: `vX.Y.Z` or `silent deployment (version unchanged)`

## Acceptance record

- [ ] Staging deployment is healthy and visibly marked as staging
- [ ] Synthetic account, project, export, and public reader-link flows pass
- [ ] Desktop and mobile smoke checks pass
- [ ] Migrations completed on staging before application testing
- [ ] Release notes contain features only; bug fixes stay in the GitHub release notes
- [ ] Creator approved this exact staging commit

## Production plan

- [ ] Merge commit is the accepted staging commit
- [ ] Production candidate will be smoke-tested before domain promotion
- [ ] Rollback owner and response are understood
