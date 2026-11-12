#!/usr/bin/env python3
"""Generate original English learning notes using a public Economist podcast preview.
No full Economist text is published. An OpenAI API key is required.
"""
import json, os, re, sys, html, hashlib
from datetime import datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

BASE=Path(__file__).resolve().parents[1]
SG=ZoneInfo("Asia/Singapore")
RSS="https://access.acast.com/rss/theeconomistmorningbriefing"
API="https://api.openai.com/v1/responses"
def fetch(url, data=None, headers=None):
    request=Request(url,data=json.dumps(data).encode() if data is not None else None,headers={"User-Agent":"BriefLab/1.0","Accept":"application/json",**({"Content-Type":"application/json"} if data is not None else {}),**(headers or {})})
    with urlopen(request,timeout=40) as response: return response.read()
def strip(text):return re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]*>"," ",text or ""))).strip()
def source():
    tree=ET.fromstring(fetch(RSS))
    options=[]
    for item in tree.findall(".//channel/item")[:12]:
        date=item.findtext("pubDate")
        desc=strip(item.findtext("description",""))
        if not date or len(desc)<100: continue
        day=parsedate_to_datetime(date).astimezone(SG).date().isoformat()
        if day>datetime.now(SG).date().isoformat():continue
        title=strip(item.findtext("title",""))
        options.append((day,title,desc[:2800],item.findtext("link") or "https://shows.acast.com/theeconomistmorningbriefing"))
    if not options:raise RuntimeError("No usable current public preview")
    return max(options,key=lambda x:x[0])
def generate(src):
    if not os.getenv("OPENAI_API_KEY"):raise RuntimeError("OPENAI_API_KEY is missing")
    date,title,excerpt,url=src
    instructions=("你是新闻英语精读教练。只根据提供的英文公开摘要提取真实出现的英语表达，不编造新闻事实。"
      "优先2到5词搭配、审慎措辞、财经表达、逻辑结构。生成3到6个学习项。"
      "每项必须写原创例句 example，不能复制新闻中的完整句子，cloze 应为原例句将目标答案连续替换为恰好六条下划线 ______。"
      "返回JSON对象，键为title,summary_zh,items。items每项必须包含type(word/phrase/logic),expression,meaning_zh,example,analysis_zh,cloze,answer,accepted(array),hint_zh,why_zh。"
      "表达要真实出现在素材中，时态调整可由 answer 体现。中文解释精确，不能虚构来源中没有的消息。")
    payload={"model":os.getenv("OPENAI_MODEL","gpt-4o-mini"),"instructions":instructions,"input":f"Date: {date}\nTitle: {title}\nPublic preview: {excerpt}","text":{"format":{"type":"json_object"}}}
    result=json.loads(fetch(API,payload,{"Authorization":"Bearer "+os.environ["OPENAI_API_KEY"]}))
    text=result.get("output_text") or next((c.get("text") for msg in result.get("output",[]) for c in msg.get("content",[]) if c.get("type")=="output_text"),None)
    if not text:raise RuntimeError("No response content from AI model")
    notes=json.loads(text)
    items=[]
    for x in notes.get("items",[]):
        fields=["expression","meaning_zh","example","analysis_zh","cloze","answer","hint_zh","why_zh"]
        if any(not isinstance(x.get(k),str) or not x[k].strip() for k in fields):continue
        if x["cloze"].count("______")!=1 or len(x["expression"].split())>5:continue
        expr=x["expression"].strip()
        if expr.lower() not in (title+" "+excerpt).lower():continue
        if x["cloze"].replace("______ ",x["answer"]+" ").replace("______",""+x["answer"])!=x["example"]:
            # Tolerate whitespace differences but reject inconsistent exercises.
            a=re.sub(r"\s+"," ",x["cloze"].replace("______",x["answer"])).strip()
            b=re.sub(r"\s+"," ",x["example"]).strip()
            if a!=b:continue
        key=hashlib.sha256((date+"|"+expr.lower()).encode()).hexdigest()[:10]
        entry={k:x[k].strip() for k in fields}
        entry.update({"id":date+"-"+key,"date":date,"type":x.get("type") if x.get("type") in ("phrase","word","logic") else "phrase","accepted":[s for s in x.get("accepted",[]) if isinstance(s,str)][:4]})
        items.append(entry)
    if len(items)<3:raise RuntimeError("Fewer than three grounded, well-formed items; preserving existing lesson")
    return {"schema_version":1,"edition":{"date":date,"title":str(notes.get("title") or title)[:140],"summary_zh":str(notes.get("summary_zh") or "")[:350],"source_url":url,"source_label":"The Economist / Acast 公开节目简介","source_mode":"public_preview","is_demo":False,"generated_at":datetime.now(SG).isoformat()},"items":items}
def main():
    latest=BASE/"content/latest.json"
    catalog=BASE/"content/catalog.json"
    if "--validate-only" in sys.argv:
        for p in (latest,catalog):
            obj=json.loads(p.read_text())
            assert isinstance(obj["items"],list)
            assert all(i.get("id") and i.get("date") and i.get("cloze","").count("______")==1 for i in obj["items"])
            print(p.name,len(obj["items"]),"OK")
        return
    src=source()
    old=json.loads(latest.read_text())
    if not old["edition"].get("is_demo") and old["edition"]["date"]>=src[0]:
        print("No newer podcast preview; retaining existing lesson")
        return
    lesson=generate(src)
    history=json.loads(catalog.read_text())["items"]
    history=[x for x in history if x.get("date")!=src[0]]+lesson["items"]
    history=sorted(history,key=lambda x:(x["date"],x["id"]))[-1500:]
    latest.write_text(json.dumps(lesson,ensure_ascii=False,indent=2)+"\n")
    catalog.write_text(json.dumps({"schema_version":1,"items":history},ensure_ascii=False,indent=2)+"\n")
    print("Generated",src[0],len(lesson["items"]),"items")
if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("Daily update failed, prior edition retained:",exc,file=sys.stderr)
        sys.exit(1)
