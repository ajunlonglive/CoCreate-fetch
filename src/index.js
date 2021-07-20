import observer from '@cocreate/observer'
import ccfilter from '@cocreate/filter'
import utils from '@cocreate/utils';
import crud from '@cocreate/crud-client';
import logic from '@cocreate/logic';
import render from '@cocreate/render';

// console.log(socket)
const CoCreateFetch = {
	selector: '[data-template_id][data-fetch_collection]',
	items: [],

	init: function() {
		let elements =  document.querySelectorAll(this.selector);
		this.initElements(elements);
		this.__initSocketEvent();
		this.__initEvents()
	},
	
	initElements: function(elements){
		for(let el of elements)
			this.initElement(el)
	},
	
	initElement: function(el) {
		// this.__initEachElement(el, true, true)
		this.__initEachElement(el)
	},
	
	// __initEachElement: function(element, isInit, checkInit, refresh) {
	__initEachElement: function(element) {
		let item_id = element.getAttribute('data-template_id');
		if (!item_id) return;
		
		if (!element.getAttribute('data-fetch_collection')) return;
		
		// if (observer.getInitialized(element, 'fetch') && isInit){
		// 	return;	
		// } 
		
		let item = ccfilter.getObjectByFilterId(this.items, item_id);
		let filter = null;
		const self = this;
		
		// if (isInit && item) {
		// 	return;
		// }
		
		// if (checkInit) {  
			// observer.setInitialized(element, 'fetch')
		// }

		if (!item) {
			filter = ccfilter.setFilter(element, "data-template_id", "template");
			let fetch_type = element.getAttribute('data-fetch_value_type') || "string";
			if (!filter) return;
			
			if (fetch_type === 'collection') {
				filter.is_collection = true;
			}
			
			item = {
				el: element,
				filter: filter,
				templateId: item_id,
				fetch_type: fetch_type
			}
			
			this.items.push(item);

			element.addEventListener("changeFilterInput", function(e) {
				self.__removeOldData(item.el)
				item.filter.startIndex = 0;
				item.filter.isRefresh = true;
				ccfilter.fetchData(item.filter);
			})
			
		} else {
			filter = item.filter
			ccfilter.changeCollection(filter);
			// if (refresh) {
				item.filter.isRefresh = true;
				self.__removeOldData(element);
				filter.isRefresh = true;
				filter.startIndex = 0;
			// }
		}
		
		ccfilter.fetchData(filter);
	},

	// refershElement: function(target ) {
	// 	// const { target } = mutation.target;
	// 	if (!target) return;
	// 	if (!target.hasAttribute('data-fetch_collection')) return;
		
	// 	this.__initEachElement(target, false, false, true);
		
	// },
	
	//. Todo: not used anywhere maybe can depreciate
	// reload: function(element) {
	// 	return;
	// 	if (!element || !element.getAttribute) {
	// 		return;
	// 	}
	// 	if (element.hasAttribute('date-template_id') && element.hasAttribute('date-fetch_collection')) {
	// 		this.__initEachElement(element, true)
	// 	}
	// },
	
	__initSocketEvent: function() {
		const self = this;
		crud.listen('readDocumentList', function(data) {
			self.__fetchedItem(data)
		})
		crud.listen('readCollectionList', function(data) {
			self.__fetchedItem(data)
		})
		
		crud.listen('createDocument', function(data) {
			self.__createItem(data)
		})
		
		crud.listen('deleteDocument', function(data) {
			self.__deleteItem(data);
		})
	},
	
	__initEvents: function() {
		const self = this;
		window.addEventListener('dndsuccess', function(e) {
			const {dropedEl, dragedEl} = e.detail;
			let dragedElTemplatId = dragedEl.getAttribute('data-template_id')
			let dragElTemplate = document.querySelector(`[data-fetch_collection][data-template_id='${dragedElTemplatId}']`);
			let dropElTemplate = self.findTemplateElByChild(dropedEl);
			
			if (!dragElTemplate || !dropElTemplate) {
				return;
			}
			
			if (!dragElTemplate.isSameNode(dropElTemplate)) {
				//. save template id
				self.updateParentTemplateOfChild(dropElTemplate, dragedEl)
				
				//. reordering
				self.reorderChildrenOfTemplate(dragElTemplate);
				self.reorderChildrenOfTemplate(dropElTemplate);
			} else {
				self.reorderChildrenOfTemplate(dropElTemplate);
			}
		})
	},
	
	
	__runLoadMore: function(templateId) {
		if (!templateId) return;
		let item = ccfilter.getObjectByFilterId(this.items, templateId);
		
		if (!item) return;
		if (item.filter.count > 0) {
			ccfilter.fetchData(item.filter)
		}
	},
	
	__removeOldData: function(wrapper) {
		let item_id = wrapper.getAttribute('data-template_id');
		let elements = wrapper.querySelectorAll("[templateId='" + item_id + "']");
		elements.forEach((el) => el.remove())
	},
	
	__cloneElement: function(clone_node, templateId, type, render_id) {
		let itemTemplateDiv = document.createElement(clone_node.parentNode.tagName || 'div');
		// let itemTemplateDiv = document.createElement('tbody');
		let template = clone_node.cloneNode(true);
		template.setAttribute('templateId', templateId);

		if (!type) type = "data"
		if (!template.getAttribute('data-render_array')) {
			template.setAttribute('data-render_array', type);
		}
		if (!template.getAttribute('data-render_key') && render_id) {
			template.setAttribute('data-render_key', render_id);
		}
		
		itemTemplateDiv.appendChild(template.cloneNode(true));
		return itemTemplateDiv;
	},
	
	__renderData: function(wrapper, data, type = "data") {

		let templateId = wrapper.getAttribute('data-template_id');
		let template = wrapper.querySelector(`.template[data-template_id='${templateId}'`);// || wrapper.querySelector('.template');
		// let template = wrapper.querySelector('.template');
		if (!template)  {
			return;
		}
		let renderId = wrapper.getAttribute('data-render_id');
		
		let passTo = wrapper.getAttribute('data-pass_to');
		let renderData = renderId ? {[renderId] : data} : data;
		
		type = type || "data";
		type = renderId ? `${renderId}.${type}` : type;

		let cloneWrapper = this.__cloneElement(template, templateId, type, renderId);
		
		// render.setValue(cloneWrapper.children, renderData, passTo, cloneWrapper);
		
		render.data({
			elements: cloneWrapper.children,
			data: renderData,
			passTo: passTo
		})
		let removeableTemplate = cloneWrapper.querySelector(`.template[data-template_id="${templateId}"]`);
		if (removeableTemplate) {
			removeableTemplate.remove();
		} else {
			return;
		}

		template.insertAdjacentHTML('beforebegin', cloneWrapper.innerHTML);
		var evt = new CustomEvent('fetchedTemplate', { bubbles: true });
		wrapper.dispatchEvent(evt);

		/// init passValueBtns
		// let forms = wrapper.parentNode.getElementsByTagName('form');
		
		// for (let i = 0; i < forms.length; i++) {
		// 	let form = forms[i];
		// 	let valuePassBtn = form.querySelector('.passValueBtn');
		// 	if (valuePassBtn) logic.__registerValuePassBtnEvent(form, valuePassBtn);
		// }
		
		// this.initElement(wrapper)
	},

	__deleteItem: function(data) {
		let collection = data['collection'];
		let document_id = data['document_id'];
		
		for (let i = 0; i < this.items.length; i++) {
			let item = this.items[i];
			
			if (item.filter.collection == collection) {
				var tmpId = item.el.getAttribute('data-template_id')
				var els = item.el.querySelectorAll("[templateId='" + tmpId + "'][data-document_id='" + document_id + "']");
				for (let j = 0; j < els.length; j++) {
					els[j].remove();
					item.startIndex--;
				}
			}
		}
	},
	
	__fetchedItem: function(data) {
		let item_id = data['element'];
		let item = ccfilter.getObjectByFilterId(this.items, item_id);
		if (item) {
			item.filter.startIndex += data['data'].length;
			let fetch_name = item.el.getAttribute('data-fetch_name');
			if (fetch_name) {
				data = data.data[0];
			}
			
			if (data) {
				if (data.metadata && data.metadata.isRefresh) {
					this.__removeOldData(item.el);
				}
				this.__renderData(item.el, data, fetch_name);
			}
			
		}
	},

	__createItem: function(data) {
		let collection = data['collection'];
		const self = this;
		let itemData = data.data;
		let render_data = data;
		render_data.data = [itemData];

		this.items.forEach((item) => {
			const {filter} = item;
			let ids = [];
			item.fetch_ids = [];
			if (filter.collection === collection && !item.el.getAttribute('data-fetch_name') && self.__checkItemByFilters(itemData, filter.filters)) {
				// ids.push(data['document_id']);
				self.__renderData(item.el, render_data)
			}
		})
	},

	findTemplateElByChild: function(element) {
		return utils.getParentFromElement(element, null, ['data-template_id', 'data-fetch_collection']);
	},
	
	// changes position of documents
	updateParentTemplateOfChild: function(template, element) {
		const name = template.getAttribute('data-filter_name')
		const value = template.getAttribute('data-filter_value')
		const operator = template.getAttribute('data-filter_operator')
		if (!name || operator != "$eq") return;

		crud.updateDocument({
			collection	: template.getAttribute('data-fetch_collection'), 
			document_id : element.getAttribute('data-document_id'), 
			data: {
				[name]: value	
			},
			broadcast	: false
		})
	},
	
	// changes position of documents
	reorderChildrenOfTemplate: function (template) {
		const orderField = template.getAttribute('data-order_by')
		const template_id = template.getAttribute('data-template_id')
		if (!orderField || !template_id) {
			return;
		}
		const children = template.querySelectorAll(`[data-template_id="${template_id}"][data-document_id]:not(.template)`)
		
		const coff = template.getAttribute('data-order_type') !== 'asc' ? -1 : 1;
		children.forEach((item, index) => {
			if (item.classList.contains('template')) {
				return
			}
			crud.updateDocument({
				collection : template.getAttribute('data-fetch_collection'), 
				document_id : item.getAttribute('data-document_id'), 
				data: {
					[orderField]: index * coff	
				},
				broadcast: false,
			})
		})
	},
	
	// ToDo: Looks like it should be a utility of filter.. 
	__checkItemByFilters: function(item, filters) {
		//. $contain, $range, $eq, $ne, $lt, $lte, $gt, $gte, $in, $nin, $geoWithin
		let flag = true;
		if (!item || !filters) {
			return false;
		}
		
		if (Array.isArray(item)) return false;
		filters.forEach(({name, operator, type, value}) => {
			
			const fieldValue = item[name]
			if (!flag) return;
			
			switch (operator) {
				case '$contain':
					if (!Array.isArray(fieldValue) || !fieldValue.some(x => value.includes(x))) flag = false;
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
					if (fieldValue == null || fieldValue == value[0]) flag = false;
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
		})
		return flag;
	}
}


observer.init({ 
	name: 'CoCreateFetchObserver', 
	observe: ['attributes'],
	attributeName: ['data-fetch_collection', 'data-fetch_name', 'data-filter_name', 'data-filter_value'],
	callback: function(mutation) {
		CoCreateFetch.initElement(mutation.target)
	}
})

observer.init({ 
	name: 'CoCreateFetchInit', 
	observe: ['addedNodes'],
	target: '[data-fetch_collection]',
	callback: function(mutation) {
		CoCreateFetch.initElement(mutation.target)
	}
})

CoCreateFetch.init();

export default CoCreateFetch;
