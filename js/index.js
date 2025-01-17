import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { $el } from "../../scripts/ui.js";
import * as util from "./libs/util.min.js";

let DEBUG = false;
let isInitialized = false;
let CLASS_NAME = "Model DB";
let DEFAULT_VALUES = {};
let DEFAULT_KEYS = [
  "positive",
  "negative",
  "seed",
  "control_after_generate",
  "steps",
  "cfg",
  "sampler_name",
  "scheduler",
  "denoise",
  "width",
  "height"
];
let db = {}; // { MODEL_NAME: { KEY: { ...OPEIONS }} }

async function getDefaultValues() {
  let response = await api.fetchApi("/shinich39/model-db/get-default-values", { cache: "no-store" });
  let data = await response.json();
  
  if (DEBUG) {
    console.log("GET /shinich39/model-db/get-default-values", data);
  }

  return data;
}

async function getData() {
  let response = await api.fetchApi("/shinich39/model-db/get-data", { cache: "no-store" });

  if (DEBUG) {
    console.log("GET /shinich39/model-db/get-data", response);
  }

  return await response.json();
}

async function setData(ckpt, key, values) {
  let response = await api.fetchApi("/shinich39/model-db/set-data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ckpt, key, values }),
  });

  if (DEBUG) {
    console.log("POST /shinich39/model-db/set-data", response);
  }

  if (response.status !== 200) {
    throw new Error(response.statusText);
  }
  return await response.json();
}

async function removeData(ckpt, key) {
  let response = await api.fetchApi("/shinich39/model-db/remove-data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ckpt, key }),
  });

  if (DEBUG) {
    console.log("POST /shinich39/model-db/remove-data", response);
  }

  if (response.status !== 200) {
    throw new Error(response.statusText);
  }

  return await response.json();
}

function getCurrentKey() {
  let date = new Date();
  let month = date.getMonth() + 1;
  let day = date.getDate();
  let hour = date.getHours();
  let minute = date.getMinutes();
  let second = date.getSeconds();

  month = month >= 10 ? month : '0' + month;
  day = day >= 10 ? day : '0' + day;
  hour = hour >= 10 ? hour : '0' + hour;
  minute = minute >= 10 ? minute : '0' + minute;
  second = second >= 10 ? second : '0' + second;

  return date.getFullYear() + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second;
}

function getKeys(ckpt) {
  return db[ckpt] ? Object.keys(db[ckpt]) : [];
}

function getValues(ckpt, key) {
  return db[ckpt]?.[key] || util.copy(DEFAULT_VALUES);
}

function getNodeValues(node) {
  let values = {};
  for (const k of DEFAULT_KEYS) {
    const w = node.widgets.find(e => e.name === k);
    values[k] = w ? w.value : DEFAULT_VALUES[k];
  }
  return values;
}

function updateKeys(node) {
  const ckptWidget = node.widgets.find(function(item) {
    return item.name === "ckpt_name";
  });

  const keyWidget = node.widgets.find(function(item) {
    return item.name === "key";
  });

  let ckpt = ckptWidget.value;
  let key = keyWidget.value;
  keyWidget.options.values = getKeys(ckpt);
  keyWidget.value = keyWidget.options.values.length > 0 ? keyWidget.options.values[0] : `NO_KEY`;
}

function updateValues(node) {
  const ckptWidget = node.widgets.find(function(item) {
    return item.name === "ckpt_name";
  });

  const keyWidget = node.widgets.find(function(item) {
    return item.name === "key";
  });

  let ckpt = ckptWidget.value;
  let key = keyWidget.value;
  let values = getValues(ckpt, key);
  for (const [k, v] of Object.entries(values)) {
    const w = node.widgets.find(e => e.name === k);
    if (w) {
      w.value = v;
    }
  }
}

function updateNode(node) {
  updateKeys(node);
  updateValues(node);
}

function updateNodes() {
  for (const node of app.graph._nodes) {
    try {
      if (node.comfyClass !== CLASS_NAME) {
        continue;
      }
      if (DEBUG) {
        console.log(CLASS_NAME, node);
      }

      updateNode(node);
    } catch(err) {
      console.error(err);
    }
  }
}

function getConfig(widgetName) {
	const { nodeData } = this.constructor;
	return nodeData?.input?.required[widgetName] ?? nodeData?.input?.optional?.[widgetName];
}

app.registerExtension({
	name: "shinich39.ModelDB",
  setup() {
    // init
    getDefaultValues()
      .then((e) => {DEFAULT_VALUES = e;})
      .then(getData)
      .then((e) => {db = e;})
      .then(() => { isInitialized = true; })
      .then(updateNodes);
  },
  nodeCreated(node) {
    try {
      if (node.comfyClass !== CLASS_NAME) {
        return;
      }
      if (DEBUG) {
        console.log(CLASS_NAME, node);
      }

      const ckptWidget = node.widgets.find(function(item) {
        return item.name === "ckpt_name";
      });

      const keyWidget = node.widgets.find(function(item) {
        return item.name === "key";
      });

      const addWidget = node.addWidget("button", "Add", "add", addWidgetClickHandler);
      const removeWidget = node.addWidget("button", "Remove", "remove", removeWidgetClickHandler);

      ckptWidget.callback = ckptWidgetChangeHandler;
      keyWidget.callback = keyWidgetChangeHandler;

      if (isInitialized) {
        updateNode(node);
      }

      function ckptWidgetChangeHandler(value) {
        if (DEBUG) {
          console.log("ckpt widget changed:", value);
        }
        updateKeys(node);
        updateValues(node);
      }
  
      function keyWidgetChangeHandler(value) {
        if (DEBUG) {
          console.log("key widget changed:", value);
        }
        if (!value) {
          keyWidget.value = "NO_KEY";
        }
        // updateKeys(node);
        updateValues(node);
      }

      function addWidgetClickHandler() {
        if (DEBUG) {
          console.log("add widget cliked.");
        }

        let ckpt = ckptWidget.value;
        let key = getCurrentKey();
        let values = getNodeValues(node);

        setData(ckpt, key, values)
          .then(function(data) {
            db = data;
            keyWidget.options.values = getKeys(ckpt);
            keyWidget.value = key;
            updateValues(node);
          });
      }

      function removeWidgetClickHandler() {
        if (DEBUG) {
          console.log("remove widget cliked.");
        }

        let ckpt = ckptWidget.value;
        let key = keyWidget.value;
        let idx = keyWidget.options.values.indexOf(key);

        if (keyWidget.options.values.length > 0 && idx > -1) {
          removeData(ckpt, key)
            .then(function(data) {
              db = data;
              keyWidget.options.values = getKeys(ckpt);
              idx = Math.min(idx, keyWidget.options.values.length - 1);
              keyWidget.value = idx > -1 ? keyWidget.options.values[idx] : "NO_KEY";
              updateValues(node);
            });
        }
      }
    } catch(err) {
      console.error(err);
    }
  }
});