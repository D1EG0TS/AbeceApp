from fastapi import FastAPI, UploadFile, File, HTTPException
from ultralytics import YOLO
import cv2
import numpy as np
from typing import List, Dict

app = FastAPI()
model = YOLO("yolov8n.pt")

@app.post("/detect")
async def detect_objects(file: UploadFile = File(...)):
    # Validar tipo de archivo
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        # Leer imagen
        image_data = await file.read()
        image = cv2.imdecode(np.frombuffer(image_data, np.uint8), cv2.IMREAD_COLOR)
        
        if image is None:
            raise HTTPException(status_code=400, detail="Invalid image file")

        height, width = image.shape[:2]
        
        # Detección con YOLO
        results = model(image)
        
        # Formatear respuesta
        detections = []
        for detection in results[0].boxes:
            x1, y1, x2, y2 = detection.xyxy[0].tolist()
            conf = detection.conf.item()
            class_id = int(detection.cls.item())
            class_name = model.names[class_id]
            
            detections.append({
                "class": class_name,
                "confidence": round(conf, 4),  # Redondear a 4 decimales
                "bbox": {
                    "x1": round(x1, 2),
                    "y1": round(y1, 2),
                    "x2": round(x2, 2),
                    "y2": round(y2, 2)
                }
            })
        
        return {
            "image_info": {
                "width": width,
                "height": height
            },
            "detections": detections,
            "detection_count": len(detections)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))