
const CoCreateFetch = {
	selector: '[data-template_id][data-fetch_collection]',
	items: [],

	init: function() {
		this.initElement();
		this.__initSocketEvent();
		this.__initEvents()
	},
	
	initElement: function(container) {
		
		let mainContainer = container || document;
		const self = this;
		if (!mainContainer.querySelectorAll) {
			return;     
		}
		let wrappers = mainContainer.querySelectorAll(this.selector);
		if (wrappers.length == 0 && mainContainer != document && mainContainer.hasAttribute('data-template_id') && mainContainer.hasAttribute('data-fetch_collection')) {
			wrappers = [mainContainer];
		}
		wrappers.forEach((wrapper) => {
			self.__initEachElement(wrapper, true, true)
		})
	},
	
	refershElement: function(mutation ) {
		const { target } = mutation;
		if (!target) return;
		if (!target.hasAttribute('data-fetch_collection')) return;
		
		this.__initEachElement(target, false, false, true);
		
	},
	
	//. public functions....
	reload: function(element) {
		return;
		if (!element || !element.getAttribute) {
			return;
		}
		if (element.hasAttribute('date-template_id') && element.hasAttribute('date-fetch_collection')) {
			this.__initEachElement(element, true)
		}
	},
	
	__initSocketEvent: function() {
		const self = this;
		CoCreate.socket.listen('readDocumentList', function(data) {
			self.__fetchedItem(data)
		})
		CoCreate.socket.listen('readCollectionList', function(data) {
			self.__fetchedItem(data)
		})
		
		CoCreate.socket.listen('createDocument', function(data) {
			self.__createItem(data)
		})
	
		CoCreate.socket.listen('deleteDocument', function(data) {
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
	
	__initEachElement: function(element, isInit, checkInit, refresh) {
		let item_id = element.getAttribute('data-template_id');
		if (!item_id) return;
		
		if (!element.getAttribute('data-fetch_collection')) return;
		
		if (CoCreate.observer.getInitialized(element, 'fetch') && isInit){
			return;	
		} 
		
		let item = CoCreate.filter.getObjectByFilterId(this.items, item_id);
		let filter = null;
		const self = this;
		
		if (isInit && item) {
			return;
		}
		
		// if (checkInit) {  
			CoCreate.observer.setInitialized(element, 'fetch')
		// }

		if (!item) {
			filter = CoCreate.filter.setFilter(element, "data-template_id", "template");
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
				CoCreate.filter.fetchData(item.filter);
			})
			
		} else {
			filter = item.filter
			CoCreate.filter.changeCollection(filter);
			if (refresh) {
				item.filter.isRefresh = true;
				self.__removeOldData(element);
				filter.isRefresh = true;
				filter.startIndex = 0;
			}
		}
		
		CoCreate.filter.fetchData(filter);
	},
	
	__runLoadMore: function(templateId) {
		if (!templateId) return;
		let item = CoCreate.filter.getObjectByFilterId(this.items, templateId);
		
		if (!item) return;
		if (item.filter.count > 0) {
			CoCreate.filter.fetchData(item.filter)
		}
	},
	
	__removeOldData: function(wrapper) {
		let item_id = wrapper.getAttribute('data-template_id');
		let elements = wrapper.querySelectorAll("[templateId='" + item_id + "']");
		elements.forEach((el) => el.remove())
	},
	
	__cloneElement: function(clone_node, templateId, type) {
		let itemTemplateDiv = document.createElement(clone_node.parentNode.tagName || 'div');
		// let itemTemplateDiv = document.createElement('tbody');
		let template = clone_node.cloneNode(true);
		template.setAttribute('templateId', templateId);

		if (!type) type = "data"
		if (!template.getAttribute('data-render_array')) {
			template.setAttribute('data-render_array', type);
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

		let cloneWrapper = this.__cloneElement(template, templateId, type);
		
		// CoCreate.render.setValue(cloneWrapper.children, renderData, passTo, cloneWrapper);
		
		CoCreate.render.data({
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
		let forms = wrapper.parentNode.getElementsByTagName('form');
		
		for (let i = 0; i < forms.length; i++) {
			let form = forms[i];
			let valuePassBtn = form.querySelector('.passValueBtn');
			if (valuePassBtn) CoCreate.logic.__registerValuePassBtnEvent(form, valuePassBtn);
		}
		
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
		let item = CoCreate.filter.getObjectByFilterId(this.items, item_id);
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
		return CoCreate.utils.getParentFromElement(element, null, ['data-template_id', 'data-fetch_collection']);
	},
	
	updateParentTemplateOfChild: function(template, element) {
		const name = template.getAttribute('data-filter_name')
		const value = template.getAttribute('data-filter_value')
		const operator = template.getAttribute('data-filter_operator')
		if (!name || operator != "$eq") return;
		
		CoCreate.crdt.replaceText({
			collection	: template.getAttribute('data-fetch_collection'), 
			document_id : element.getAttribute('data-document_id'), 
			name, 
			value		: value, 
			broadcast	: false,
			update_crud	: true
		})
	},
	
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
			CoCreate.crdt.replaceText({
				collection : template.getAttribute('data-fetch_collection'), 
				document_id : item.getAttribute('data-document_id'), 
				name: orderField, 
				value: index * coff, 
				broadcast: false,
				update_crud: true
			})
		})
	},
	
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



CoCreate.observer.add({ 
	name: 'CoCreateFetchObserver', 
	observe: ['attributes'],
	attributes: ['data-fetch_collection', 'data-filter_name'],
	callback: function(mutation) {
		CoCreateFetch.refershElement(mutation)
	}
})

CoCreate.observer.add({ 
	name: 'CoCreateFetchInit', 
	observe: ['subtree', 'childList'],
	include: "[data-fetch_collection]",
	callback: function(mutation) {
		CoCreateFetch.initElement(mutation.target)
	}
})

CoCreateFetch.init();

export default CoCreateFetch;
