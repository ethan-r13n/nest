#!/usr/bin/env python3
from pathlib import Path,PurePosixPath
import json,hashlib,zipfile,re,posixpath,urllib.parse,html
root=Path(__file__).resolve().parents[2];ui=root/'ui';repo=root.parents[1]
# Refresh explicit source snapshots without changing the source documents.
resources=[]
for src,dst in [('docs/technical-spec.md','technical-spec.md'),('README.md','repository-readme.md')]:
 raw=(repo/src).read_bytes();(ui/'spec/resources'/dst).write_bytes(raw);resources.append({'source':src,'artifact':dst,'sha256':hashlib.sha256(raw).hexdigest(),'captured':'2026-10-25'})
(ui/'spec/resources/manifest.json').write_text(json.dumps(resources,indent=2))
files={}
for p in root.iterdir():
 if p.is_file() and p.suffix in ['.html','.css','.js','.json','.txt','.md']:files[p.name]=p.read_bytes()
for folder in ['assets','spec','mockups','variations','ui']:
 for p in (root/folder).rglob('*'):
  if p.is_file() and p.suffix!='.zip' and p.name!='handoff-manifest.json' and not p.name.startswith('.'):
   files[p.relative_to(root).as_posix()]=p.read_bytes()
# Root legacy ZIP links are redirected only inside the self-contained handoff.
if 'index.html' in files:files['index.html']=files['index.html'].replace(b'nest-brand-kit.zip',b'ui/README.txt').replace(b'Download kit',b'Read handoff')
if 'variations/index.html' in files:files['variations/index.html']=files['variations/index.html'].replace(b'nest-logo-variations.zip',b'README.txt').replace(b'Download all variations',b'Read asset list')
if 'ui/designs.html' in files:files['ui/designs.html']=files['ui/designs.html'].replace(b'nest-ui-handoff.zip',b'README.txt').replace(b'Download updated handoff',b'Read handoff')
missing=[]
for name,raw in files.items():
 if not name.endswith('.html'):continue
 for value in re.findall(r'(?:href|src)=[\'\"]([^\'\"]+)',raw.decode(errors='ignore')):
  value=html.unescape(value)
  if value.startswith(('#','/')) or ':' in value:continue
  rel=urllib.parse.unquote(value.split('#')[0].split('?')[0]);target=posixpath.normpath(posixpath.join(posixpath.dirname(name),rel))
  if not rel:continue
  if target not in files and target+'/index.html' not in files:missing.append({'file':name,'link':value})
manifest={'title':'Nest UI Design Handoff','version':'0.6.0','created':'2026-10-25','total_distinct_views':32,'total_hash_routes_including_alias':33,'additional_routes':4,'expanded_routes':['chat','research-defi','research-rwa','plan'],'identity':'Original woven Nest with solid circular egg','entry_points':{'design_index':'ui/designs.html','interactive':'ui/index.html','specification':'ui/spec/index.html','missing_screen_audit':'ui/spec/completion.html','chat_discovery':'ui/spec/discovery.html','raven_catalog':'ui/spec/raven-catalog.json','logos':'ui/spec/logos.html','machine_spec':'spec/ui-design-spec.json'},'verification':'ui/spec/verification-market-feedback.json','logo_assets':179,'dedicated_rwa_marks_unavailable':16,'archive_html_links_missing':missing,'files':[{'path':n,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()} for n,raw in sorted(files.items())]}
(ui/'handoff-manifest.json').write_text(json.dumps(manifest,indent=2));files['ui/handoff-manifest.json']=(ui/'handoff-manifest.json').read_bytes()
archive=ui/'nest-ui-handoff.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for name,raw in sorted(files.items()):z.writestr('nest-ui-handoff/'+name,raw)
with zipfile.ZipFile(archive) as z:bad=z.testzip()
print(json.dumps({'files':len(files),'bytes':archive.stat().st_size,'archive_test':bad,'missing_html_links':missing},indent=2))
