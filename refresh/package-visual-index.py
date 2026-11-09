import argparse,json,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--index',required=True);p.add_argument('--output',required=True);a=p.parse_args()
data=json.loads(Path(a.index).read_text(encoding='utf8'));records=data.pop('records');out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
parts=[];digests={}
for offset in range(0,len(records),60):
 name=f'part-{offset//60:03d}.json';content=json.dumps(records[offset:offset+60],ensure_ascii=False,separators=(',',':')).encode('utf8');(out/name).write_bytes(content);parts.append(name);digests[name]=hashlib.sha256(content).hexdigest()
data['parts']=parts;data['part_sha256']=digests;(out/'manifest.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('Visual index packaged:',len(records),'photos,',len(parts),'parts')
