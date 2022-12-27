const { DOMParser, XMLSerializer } = require("xmldom");

const attributesMap = {
  "android:pathData": "d",
  "android:fillColor": "fill",
  "android:strokeLineJoin": "stroke-linejoin",
  "android:strokeLineCap": "stroke-linecap",
  "android:strokeMiterLimit": "stroke-miterlimit",
  "android:strokeWidth": "stroke-width",
  "android:strokeColor": "stroke",
  "android:fillType": "fill-rule",
  "android:fillAlpha": "fill-opacity"
};

const attributeTransforms = {
    'android:fillType': (value) => value && value.toLowerCase(),
}

const groupAttrsMap = {
    'android:name': 'id',
    'android:pivotX': { transform: 'pivotX' },
    'android:pivotY': { transform: 'pivotX' },
    'android:rotation': { transform: 'rotation' },
    'android:scaleX': { transform: 'scaleX' },
    'android:scaleY': { transform: 'scaleY' },
    'android:translateX': { transform: 'translateX' },
    'android:translateY': { transform: 'translateY' },
}

function parsePath(root, pathNode) {
    const svgPath = root.createElement("path");
    svgPath.setAttribute("fill", "none");

    Array.from(pathNode.attributes).forEach((attr) => {
      const svgAttrName = attributesMap[attr.name];
      const transformer = attributeTransforms[attr.name];
      if (svgAttrName) {
        const svgAttrValue = transformer ? transformer(attr.value) : attr.value;
        svgPath.setAttribute(svgAttrName, svgAttrValue);
      }
    });

    return svgPath;
}

function transformNode(node, parent, root, defs) {

    if (node.tagName === 'path') {
        return parsePath(root, node);
    }

    if (node.tagName === 'group') {
        const groupNode = root.createElement('g');
        
        const attrs = new Map();
        Array.from(node.attributes).forEach(attr => {
            const svgAttr = groupAttrsMap[attr.name];
            if (svgAttr.transform) {
                const prevTransform = attrs['transform'] || {};                
                prevTransform[svgAttr.transform] = attr.value;
                attrs.set('transform', prevTransform);

            } else {
                attrs.set(svgAttr, attr.value);
            }
        });
        
        if (attrs.size > 0) {
            const transforms = attrs.get('transform');
            if (transforms) {
                const scaleX = transforms.scaleX || 0;
                const scaleY = transforms.scaleY || 0;
                const hasScale = scaleX !== 0 || scaleY !== 0


                const pivotX = transforms.pivotX || 0;
                const pivotY = transforms.pivotY || 0;                
                const hasPivot = pivotX !== 0 || pivotY !== 0


                const translateX = transforms.translateX || 0;
                const translateY = transforms.translateY || 0;
                const hasTranslation = translateX !== 0 || translateY !== 0
                
                const rotation = transforms.pivotY || 0;
                const hasRotation = rotation !== 0;

                const t = [];
        
                if (hasScale) {
                    t.push(`scale(${scaleX}, ${scaleY})`);
                }

                if (hasRotation) {
                    t.push(`rotation(${rotation})`);
                }

                if (hasTranslation) {
                    t.push(`translation(${translateX}, ${translateY})`);
                }

                if (hasPivot) {
                    // TODO: Have no idea for now :(
                }
                
                if (t.length) {
                    groupNode.setAttribute('transform', t.join(' '));
                }
                attrs.delete('transform');    
            }

            attrs.forEach((value, key) => {
                groupNode.setAttribute(key, value);
            })
        }

        let prevClipPathId = null;
    
        Array.from(node.childNodes).forEach(it => {
            const childPath = transformNode(it, node, root);

            if (childPath) {
                const clipPathNode = childPath.clipPathNode
                if (clipPathNode) {
                    if (defs) {
                        const size = defs.childNodes.length
                        prevClipPathId = `clip_path_${size}`
                        clipPathNode.setAttribute('id', prevClipPathId);
                        defs.appendChild(clipPathNode);
                    }
                    return;
                }

                if (prevClipPathId) {
                    childPath.setAttribute('clip-path', `url(#${prevClipPathId})`);
                    prevClipPathId = null;
                }

                groupNode.appendChild(childPath);
            }
        });
        
        return groupNode;
    }

    if (node.tagName === 'clip-path') {
        const pathData = node.getAttribute('android:pathData');
        const svgClipPathNode = root.createElement('clipPath');
        const path = root.createElement('path');

        path.setAttribute('d', pathData);
        svgClipPathNode.appendChild(path);

        const n = new XMLSerializer().serializeToString(svgClipPathNode);
        return { clipPathNode: svgClipPathNode }
    }

    return null;
}

function removeDimenSuffix(dimen) {
    dimen = dimen.trim();
    if (!dimen) {
        return dimen;
    }

    if (!isNaN(+dimen)) {
        return dimen;
    }

    if (typeof dimen === 'string') {
        return dimen.substring(0, dimen.length - 2);
    }
    return dimen;
}


function transform(content, options) {

    const parser = new DOMParser();
  const doc = parser.parseFromString(content);

  const vectorDrawables = doc.getElementsByTagName("vector");
  if (vectorDrawables.length !== 1) {
    throw new Error("VectorDrawable is invalid");
  }

  const vectorDrawable = vectorDrawables[0];
  
  const viewportWidth = vectorDrawable.getAttribute("android:viewportWidth");
  const viewportHeight = vectorDrawable.getAttribute("android:viewportHeight");

  const outputWidth = removeDimenSuffix(vectorDrawable.getAttribute('android:width')) 
  const outputHeight = removeDimenSuffix(vectorDrawable.getAttribute('android:height'));

  const svgNode = doc.createElement("svg");

  svgNode.setAttribute('id', 'vector')
  svgNode.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svgNode.setAttribute("width", outputWidth || viewportWidth);
  svgNode.setAttribute("height", outputHeight || viewportHeight);
  svgNode.setAttribute("viewBox", `0 0 ${viewportWidth} ${viewportHeight}`);

  const childrenNodes = Array.from(doc.documentElement.childNodes).filter(it => it.tagName);

  const defsNode = doc.createElement('defs');
  const nodes = childrenNodes.map(it => transformNode(it, doc.documentElement, doc, defsNode));

  if (defsNode.childNodes.length) {
    svgNode.appendChild(defsNode);
  }

  const nodeIndices = {
      g: 0,
      path: 0,
  }

  nodes.forEach(node => {
    const id = node.getAttribute('id');
    
    const currentId = nodeIndices[node.tagName];
    if (typeof currentId === 'number') {
        nodeIndices[node.tagName] = currentId + 1;
    }

    node.setAttribute('id', id || `${node.tagName}_${currentId}`);
    svgNode.appendChild(node);

  });

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgNode);

  if (options) {
    if (options.pretty) {
        return require('xml-formatter')(svgString);
    }
  }
  return svgString;
}

module.exports = {
    transform,
}
