
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse, HTMLResponse
from openai import OpenAI
import base64
import uvicorn
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Dict, Optional

import os
from dotenv import load_dotenv


load_dotenv()

app = FastAPI()
# 挂载静态文件目录
app.mount("/static", StaticFiles(directory="static"), name="static")


#连接至OpenAI API
client = OpenAI(
    api_key=os.environ.get("N1N_API_KEY"),
    base_url="https://api.n1n.ai/v1"
)

#客户端2：DeepSeek，用于对话
client_deepseek = OpenAI(
    api_key=os.environ.get("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)

@app.get("/")
async def get_index():
    with open("index.html", "r", encoding="utf-8") as f:
        html = f.read()
    return HTMLResponse(content=html)


@app.get("/favicon.ico")
async def get_favicon():
    return JSONResponse(content={}, status_code=404)

#识别接口
@app.post("/recognize")
async def recognize(file: UploadFile = File(...)):
    # 读取图片
    image = await file.read()
    img_base64 = base64.b64encode(image).decode()
    
    #API调用
    response = client.chat.completions.create(
        model="qwen-vl-max",
        messages=[
            {
                "role": "user",
                "content": [
                {"type": "text", "text": """请识别这张图片中的物品,按以下格式返回：
{
    "name": "物品名称",
    "color": "主要颜色",
    "material": "材质（如陶瓷、塑料、玻璃、金属等）",
    "shape": "形状（如圆柱形、方形、不规则等）",
    "feature": "其他特征（如花纹、手柄、图案等）"
    等等
}

如果某项不确定，可以跳过。"""},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_base64}"}}
                ]
            }
        ],
        stream=False
    )
    
    # 解析AI返回的JSON
    import json
    try:
        # AI可能返回带```json标记的内容，需要清理
        content = response.choices[0].message.content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        
        item_info = json.loads(content.strip())
        
    except:
        # 如果解析失败，返回默认结构
        item_info = {
            "name": response.choices[0].message.content.strip(),
            "color": "未知",
            "material": "未知",
            "shape": "未知",
            "feature": "未知"
        }

    # 返回结果
    return JSONResponse({
        "result": item_info,
        "item_name": item_info.get("name", "未知")
    })


# 新增：对话历史存储（简单实现，用内存字典）
# 生产环境建议用 Redis，当前演示够用
conversation_history: Dict[str, List[Dict[str, str]]] = {}

class ChatRequest(BaseModel):
    session_id: str      # 会话ID，用来区分不同用户
    message: str         # 用户当前说的话
    product_name: Optional[str] = None

@app.post("/chat")
async def chat(request: ChatRequest):
    session_id = request.session_id
    product = request.product_name
    
    # 1. 获取或创建会话历史
    if session_id not in conversation_history:
        # 根据是否有商品选择不同的系统提示词
        if product and product != "null" and product.strip():
        #有商品识别结果的情况
            system_prompt = f"""通过简洁的，列表式的可视化参数帮助客户选择合适的商品，这是你的目标。用户当前正在查看商品：【{product}】。
背景是：

虽然人工智能已被广泛应用于在线购物中的产品搜索，但现有的系统通常通过预测用户的需求，然后直接推荐产品来工作。
这种基于预测的方法往往会导致不令人满意的结果，因为人工智能经常误解用户的意图，用户也很难清楚地表达他们的真实需求。
这个问题是因为缺乏一种让用户控制决策过程的替代方法。
所以现在你不再猜测和推荐，而是将产品选择分解为清晰、可理解的参数，允许用户在执行搜索之前明确指定他们的偏好。
在该框架中，人工智能不会直接推荐产品。
首先将产品领域分解为透明、用户可理解的参数（例如，使用场景、性能等级），并给出明确的解释，允许用户明确配置他们的偏好，然后根据用户指定的标准进行精确的产品搜索。

**输出格式要求: 重点是每写一点一定要空行, 按照格式1.空行, 2.空行, 3.空行**

记住：你推荐的商品是 {product}，不要推荐其他不相关的东西。
"""

        else:
        # 无商品：通用助手模式
            system_prompt = """通过简洁的，列表式的可视化参数帮助客户选择合适的商品，这是你的目标。
背景是：
虽然人工智能已被广泛应用于在线购物中的产品搜索，但现有的系统通常通过预测用户的需求，然后直接推荐产品来工作。
这种基于预测的方法往往会导致不令人满意的结果，因为人工智能经常误解用户的意图，用户也很难清楚地表达他们的真实需求。
这个问题是因为缺乏一种让用户控制决策过程的替代方法。
所以现在你不再猜测和推荐，而是将产品选择分解为清晰、可理解的参数，允许用户在执行搜索之前明确指定他们的偏好。
在该框架中，人工智能不会直接推荐产品。
首先将产品领域分解为透明、用户可理解的参数（例如，使用场景、性能等级），并给出明确的解释，允许用户明确配置他们的偏好，然后根据用户指定的标准进行精确的产品搜索。
**输出格式要求: 重点是每写一点一定要空行, 按照格式1.空行, 2.空行, 3.空行**

"""
            
        conversation_history[session_id] = [
            {"role": "system", "content": system_prompt}
        ]
    
    # 2. 把用户新消息加入历史
    conversation_history[session_id].append({"role": "user", "content": request.message})
    
    # 3. 调用 DeepSeek API（兼容 OpenAI 格式）
    try:
        response = client_deepseek.chat.completions.create(
            model="deepseek-v4-pro",
            messages=conversation_history[session_id],
            temperature=0.7,
            max_tokens=800,
            stream=False
        )
        reply = response.choices[0].message.content
        
        # 4. 把 AI 回复加入历史
        conversation_history[session_id].append({"role": "assistant", "content": reply})
        
        return JSONResponse({
            "success": True,
            "reply": reply
        })
    except Exception as e:
        return JSONResponse({
            "success": False,
            "error": str(e)
        }, status_code=500)




if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)


