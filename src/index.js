/*global CustomEvent*/
import observer from '@cocreate/observer';
import ccfilter from '@cocreate/filter';
import crud from '@cocreate/crud-client';
import render from '@cocreate/render';
import uuid from '@cocreate/uuid';

const CoCreateFetch = {
	selector: '[template_id][fetch-collection], [template_id][fetch-collections]',
	items: [],

	init: function() {
		let elements =  document.querySelectorAll(this.selector);
		this.initElements(elements);
		this.__initSocketEvent();
		this.__initEvents();
	},
	
	initElements: function(elements){
		for(let element of elements)
			this.initElement(element);
	},
	
	initElement: function(element) {
		let isCollections;
		if (!element.getAttribute('fetch-collection')) {
			isCollections = element.hasAttribute('fetch-collections');
			if (!isCollections) return;
		}
		let item_id = element.getAttribute('template_id');
		if (!item_id) return;
		if(/{{\s*([\w\W]+)\s*}}/g.test(item_id))
			return;

		if (item_id == '$auto'){
			item_id = item_id.replace(/\$auto/g, uuid.generate(6));
			element.setAttribute('template_id', item_id);
			let elements = element.querySelectorAll('[template_id="$auto"]');
			for (let el of elements)
				el.setAttribute('template_id', item_id);
		}
		
		let parentEls = element.getAttribute('filter-value');
		if (parentEls == 'parent'){
			let ele = element.parentElement.closest('[filter-value]');
			if (ele) {
				let value = ele.getAttribute('filter-value');
				element.setAttribute('template_id', item_id);
				element.setAttribute('filter-value', value);
			}
		}

		let item = ccfilter.getObjectByFilterId(this.items, item_id);
		let filter = null;
		const self = this;
		
		if (!item) {
			filter = ccfilter.setFilter(element, "template_id", "template");
			if (!filter) return;
			
			if (isCollections) {
				filter.is_collection = true;
			}
			
			item = {
				el: element,
				filter: filter,
				templateId: item_id,
			};
			
			this.items.push(item);

			element.addEventListener("changeFilterInput", function(e) {
				self.__removeAllElements(item.el);
				item.filter.startIndex = 0;
				item.filter.isRefresh = true;
				ccfilter.fetchData(item.filter);
			});
			
			self.__removeAllElements(element);

		} else {
			item.el = element;
			filter = item.filter;
			ccfilter.changeCollection(filter);
			ccfilter.changeFilter(filter);
			item.filter.isRefresh = true;
			self.__removeAllElements(element);
			filter.isRefresh = true;
			filter.startIndex = 0;
		}
		
		ccfilter.fetchData(filter);
	},
	
	__renderElements: function(wrapper, data, type = "data") {
		let auto;
		let templateId = wrapper.getAttribute('template_id');

		let template = wrapper.querySelector(`.template[template_id='${templateId}'`);// || wrapper.querySelector('.template');
		if (!template) return;
		
		let renderId = wrapper.getAttribute('render_id');
		if (renderId == '$auto'){
			renderId = renderId.replace(/\$auto/g, uuid.generate(6));
			auto = "true";
			wrapper.setAttribute('render_id', renderId);
		}
		
		let renderData = renderId ? {[renderId] : data} : data;
		
		type = type || "data";
		type = renderId ? `${renderId}.${type}` : type;

		let cloneWrapper = this.__cloneTemplate(template, templateId, type, renderId, auto);
		
		render.data({
			elements: cloneWrapper.children,
			data: renderData,
		});
		
		let removeableTemplate = cloneWrapper.querySelector(`.template[template_id="${templateId}"]`);
		if (removeableTemplate) {
			removeableTemplate.remove();
		} else {
			return;
		}

		template.insertAdjacentHTML('beforebegin', cloneWrapper.innerHTML);
		var evt = new CustomEvent('fetchedTemplate', { bubbles: true });
		wrapper.dispatchEvent(evt);

	},

	__cloneTemplate: function(clone_node, templateId, type, render_id, auto) {
	
		let itemTemplateDiv = document.createElement(clone_node.parentNode.tagName || 'div');
		let template = clone_node.cloneNode(true);
		template.setAttribute('templateId', templateId);

		if (!type) type = "data";
		if (!template.getAttribute('render-array')) {
			template.setAttribute('render-array', type);
		}
		if (!template.getAttribute('render-key') && render_id) {
			template.setAttribute('render-key', render_id);
		}
		
		template = template.outerHTML.replace(/\$auto/g, render_id);
		itemTemplateDiv.innerHTML = template;
		return itemTemplateDiv;
	},
	
	__removeAllElements: function(wrapper) {
		let item_id = wrapper.getAttribute('template_id');
		let elements = wrapper.querySelectorAll("[templateId='" + item_id + "']");
		elements.forEach((el) => el.remove());
	},

	__initSocketEvent: function() {
		const self = this;
		crud.listen('readDocumentList', function(data) {
			self.__fetchedData(data);
		});
		crud.listen('readCollectionList', function(data) {
			self.__fetchedData(data);
		});
		
		crud.listen('createDocument', function(data) {
			self.__addElements(data);
		});
		
		crud.listen('updateDocument', function(data) {
			self.__addElements(data);
		});
		
		crud.listen('deleteDocument', function(data) {
			self.__removeElements(data);
		});
	},

	__addElements: async function(data) {
		let Data;
		if (Array.isArray(data.data))
			Data = data.data[0];
		else
			Data = data.data;
		if (!Data._id) return;
		let collection = data['collection'];
		if(collection == 'crdt-transactions') return;
		const self = this;
		let items = this.items;

		for (let item of items) {
			const {filter} = item;
			let itemData;
			
			if (filter.collection === collection && !item.el.getAttribute('fetch-name')) {
				let document_id = item.documentList.get(data.document_id);
				if(!item.documentList.has(data.document_id)){
					let documentData = await crud.readDocument({collection, document_id: data.document_id});
					itemData = documentData.data;
				}
				else {
					itemData = {...document_id, ...Data};
				}
				
				let render_data = data;
				render_data.data = [itemData];
				document_id = item.documentList.get(data.document_id)
				let isFilter = self.__checkItemByFilters(itemData, filter.filters, document_id)
				if(isFilter && !document_id){
					item.documentList.set(data.document_id, itemData);
					item.filter.startIndex += 1;
					self.__renderElements(item.el, render_data);
				}
				else if(!isFilter && document_id){
					item.documentList.delete(data.document_id);
					item.filter.startIndex -= 1;
					var tmpId = item.el.getAttribute('template_id');
					var els = item.el.querySelectorAll("[templateId='" + tmpId + "'][document_id='" + data.document_id + "']");
					for (let j = 0; j < els.length; j++) {
						els[j].remove();
						item.startIndex--;
					}
				}
			}
		}
	},
	
	__removeElements: function(data) {
		let collection = data['collection'];
		let document_id = data['document_id'];
		
		for (let i = 0; i < this.items.length; i++) {
			let item = this.items[i];
			
			if (item.filter.collection == collection) {
				var tmpId = item.el.getAttribute('template_id');
				var els = item.el.querySelectorAll("[templateId='" + tmpId + "'][document_id='" + document_id + "']");
				for (let j = 0; j < els.length; j++) {
					els[j].remove();
					item.startIndex--;
				}
			}
		}
	},
	
	__fetchedData: function(data) {
		let item_id = data['element'];
		let item = ccfilter.getObjectByFilterId(this.items, item_id);
		if (item) {
			item.filter.startIndex += data['data'].length;
			let fetch_name = item.el.getAttribute('fetch-name');
			if (fetch_name) {
				data = data.data[0];
			}
			
			if (data) {
				item.documentList = new Map(data.data.map(key => [key._id, key]));
				if (data.metadata && data.metadata.isRefresh) {
					this.__removeAllElements(item.el);
				}
				this.__renderElements(item.el, data, fetch_name);
			}
			
		}
	},

	// __runLoadMore: function(templateId) {
	// 	if (!templateId) return;
	// 	let item = ccfilter.getObjectByFilterId(this.items, templateId);
		
	// 	if (!item) return;
	// 	if (item.filter.count > 0) {
	// 		ccfilter.fetchData(item.filter)
	// 	}
	// },
	
	// dnd event listner to update document positions and orders
	__initEvents: function() {
		const self = this;
		window.addEventListener('dndsuccess', function(e) {
			const {dropedEl, dragedEl} = e.detail;
			let dragedElTemplatId = dragedEl.getAttribute('templateid');
			let dragElTemplate = document.querySelector(`[fetch-collection][template_id='${dragedElTemplatId}']`);
			if (!dropedEl.parentElement) return;
			let dropElTemplate = dropedEl.parentElement.closest('[template_id][fetch-collection]');

			if (!dragElTemplate || !dropElTemplate) {
				return;
			}
			
			if (!dragElTemplate.isSameNode(dropElTemplate)) {
				//. save template id
				self.updateParentTemplateOfChild(dropElTemplate, dragedEl);
				
				//. reordering
				self.reorderChildrenOfTemplate(dragElTemplate);
				self.reorderChildrenOfTemplate(dropElTemplate);
			} else {
				self.reorderChildrenOfTemplate(dropElTemplate);
			}
		});
	},

	// changes position of documents
	updateParentTemplateOfChild: function(template, element) {
		const name = template.getAttribute('filter-name');
		const value = template.getAttribute('filter-value');
		const operator = template.getAttribute('filter-operator');
		if (!name || operator != "$eq") return;

		crud.updateDocument({
			collection	: template.getAttribute('fetch-collection'), 
			document_id : element.getAttribute('document_id'), 
			data: {
				[name]: value	
			},
			broadcast	: false
		});
	},
	
	// changes position of documents
	reorderChildrenOfTemplate: function (template) {
		const orderField = template.getAttribute('order-by');
		const template_id = template.getAttribute('template_id');
		if (!orderField || !template_id) {
			return;
		}
		const children = template.querySelectorAll(`[templateid="${template_id}"][document_id]:not(.template)`);
		
		const coff = template.getAttribute('order-type') !== 'asc' ? -1 : 1;
		children.forEach((item, index) => {
			if (item.classList.contains('template')) {
				return;
			}
			crud.updateDocument({
				collection : template.getAttribute('fetch-collection'), 
				document_id : item.getAttribute('document_id'), 
				data: {
					[orderField]: index * coff	
				},
				broadcast: false,
			});
		});
	},
	
	// ToDo: Looks like it should be a utility of filter.. 
	__checkItemByFilters: function(item, filters, document_id) {
		//. $contain, $range, $eq, $ne, $lt, $lte, $gt, $gte, $in, $nin, $geoWithin
		let flag = true;
		if (!item || !filters) {
			return false;
		}
		if (Array.isArray(item)) return false;
		filters.forEach(({name, operator, type, value}) => {
			
			const fieldValue = item[name];
			// if (!flag) return;
			if(fieldValue === undefined && document_id) return;
			switch (operator) {
				case '$contain':
					// if (!Array.isArray(fieldValue) || !fieldValue.some(x => value.includes(x))) flag = false;
					if (!fieldValue.includes(value[0])) flag = false; 
					break;
				case '$range':
					if (value[0] !== null && value[1] !== null) {
						if (value[0] > fieldValue || value[1] <= fieldValue)
							flag = false;
					} else if (item.value[0] == null && value[1] >= fieldValue) {
						flag = false;
					} else if (item.value[1] == null && value[0] <= fieldValue) {
						flag = false;
					}
					break;
				case '$eq':
					if (fieldValue != value[0]) flag = false; 
					break;
				case '$ne':
					if (fieldValue == value[0]) flag = false;
					break;
				case '$lt':
					if (fieldValue >= value[0]) flag = false;
					break;
				case '$lte':
					if (fieldValue > value[0]) flag = false;
					break;
				case '$gt':
					if (fieldValue <= value[0]) flag = false;
					break;
				case '$gte':
					if (fieldValue < value[0]) flag = false;
					break;
				case '$in':
					if (!Array.isArray(fieldValue) || !fieldValue.some(x => value.includes(x))) flag = false;
					break;
				case '$nin':
					if (Array.isArray(fieldValue) && fieldValue.some(x => value.includes(x))) flag = false;
					break;

			}
		});
		return flag;
	}
};

observer.init({ 
	name: 'CoCreateFetchObserver', 
	observe: ['attributes'],
	attributeName: ['fetch-collection', 'fetch-name', 'filter-name', 'filter-value'],
	callback: function(mutation) {
		CoCreateFetch.initElement(mutation.target);
	}
});

observer.init({ 
	name: 'CoCreateFetchInit', 
	observe: ['addedNodes'],
	target: '[fetch-collection]',
	callback: function(mutation) {
		CoCreateFetch.initElement(mutation.target);
	}
});

CoCreateFetch.init();

export default CoCreateFetch;
