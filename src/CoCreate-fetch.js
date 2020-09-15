
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
		if (wrappers.length == 0 && mainContainer != document && mainContainer.hasAttributes('date-template_id') && mainContainer.hasAttributes('date-fetch_collection')) {
			wrappers = [mainContainer];
		}
		wrappers.forEach((wrapper) => self.__initEachElement(wrapper, true, true))
	},
	
	//. public functions....
	reload: function(element) {
		if (!element || !element.getAttribute) {
			return;
		}
		this.__initEachElement(element, true)
	},
	
	__initSocketEvent: function() {
		const self = this;
		CoCreateSocket.listen('readDocumentList', function(data) {
			self.__fetchedItem(data)
		})
		CoCreateSocket.listen('readCollectionList', function(data) {
			self.__fetchedItem(data)
		})
		
		CoCreateSocket.listen('createDocument', function(data) {
			self.__createItem(data)
		})
	
		CoCreateSocket.listen('deleteDocument', function(data) {
			self.__deleteItem(data);
		})
	},
	
	__initEvents: function() {
		const self = this;
		document.addEventListener('dndsuccess', function(e) {
			const {dropedEl, dragedEl} = e.detail;
			let dragElTemplate = self.findTemplateElByChild(dragedEl);
			let dropElTemplate = self.findTemplateElByChild(dropedEl);
			
			if (!dragElTemplate || !dropElTemplate) {
				return;
			}
			
			if (!dragElTemplate.isSameNode(dropElTemplate)) {
				//. save template id
				self.updateParentTemplateOfChild(dragElTemplate, dragedEl)
				
				//. reordering
				self.reorderChildrenOfTemplate(dragElTemplate);
				self.reorderChildrenOfTemplate(dropElTemplate);
			} else {
				self.reorderChildrenOfTemplate(dropElTemplate);
			}
		})
	},
	
	__initEachElement: function(element, isInit, checkInit) {
		let item_id = element.getAttribute('data-template_id');
		if (!item_id) return;

		let item = CoCreateFilter.getObjectByFilterId(this.items, item_id);
		let filter = null;
		const self = this;
		
		if (checkInit && CoCreateInit.getInitialized(element)){
			return;	
		} 

		if (!item) {
			filter = CoCreateFilter.setFilter(element, "data-template_id", "template");
			let fetch_type = element.getAttribute('data-fetch_value_type') || "string";
			if (!filter) return;

			// if (checkInit) {  
				CoCreateInit.setInitialized(element)
			// }
			
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
				CoCreateFilter.fetchData(item.filter);
			})
			
		} else {
			filter = item.filter
			CoCreateFilter.changeCollection(filter);
			if (isInit) {
				self.__removeOldData(element);
				filter.startIndex = 0;
			}
		}
		CoCreateFilter.fetchData(filter);
	},
	
	__runLoadMore: function(templateId) {
		if (!templateId) return;
		let item = CoCreateFilter.getObjectByFilterId(this.items, templateId);
		
		if (!item) return;
		if (item.filter.count > 0) {
			CoCreateFilter.fetchData(item.filter)
		}
	},
	
	__removeOldData: function(wrapper) {
		let item_id = wrapper.getAttribute('data-template_id');
		let elements = wrapper.querySelectorAll("[templateId='" + item_id + "']");
		elements.forEach((el) => el.remove())
	},
	
	__cloneElement: function(clone_node, templateId, type = "data") {
		let itemTemplateDiv = document.createElement('div');
		let template = clone_node.cloneNode(true);
		template.setAttribute('templateId', templateId);
		template.removeAttribute('id');
		
		if (!type) type = "data"
		if (!template.getAttribute('data-render_array')) {
			template.setAttribute('data-render_array', type);
		}
		
		itemTemplateDiv.appendChild(template.cloneNode(true));
		return itemTemplateDiv;
	},
	
	__renderData: function(wrapper, data, type) {

		let template = wrapper.querySelector('.template');
		if (!template) return;
		
		let templateId = wrapper.getAttribute('data-template_id');
		let cloneWrapper = this.__cloneElement(template, templateId, type);
		let passTo = wrapper.getAttribute('data-pass_to');
		CoCreateRender.setValue(cloneWrapper.children, data, cloneWrapper, passTo);
		cloneWrapper.querySelector('.template').remove();
	
		template.insertAdjacentHTML('beforebegin', cloneWrapper.innerHTML);
		
		var evt = new CustomEvent('fetchedTemplate', { bubbles: true });
		wrapper.dispatchEvent(evt);
		this.__initNewAtags(wrapper.parentNode);
		
		/// init passValueBtns
		let forms = wrapper.parentNode.getElementsByTagName('form');
		
		for (let i = 0; i < forms.length; i++) {
			let form = forms[i];
			let valuePassBtn = form.querySelector('.passValueBtn');
			if (valuePassBtn) CoCreateLogic.__registerValuePassBtnEvent(form, valuePassBtn);
		}
		
		this.initElement(wrapper)
	},
	
	__initNewAtags: function(parent) {
		let aTags = parent.querySelectorAll('a');
		aTags.forEach(aTag => {
			if (aTag.classList.contains('newLink')) {
				aTag.addEventListener('click', function(e) {
					e.preventDefault();
					CoCreateLogic.setLinkProcess(this);
				})
			}
		})
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
		let item = CoCreateFilter.getObjectByFilterId(this.items, item_id);
		
		if (item) {
			item.filter.startIndex += data['data'].length;
			let fetch_name = item.el.getAttribute('data-fetch_name');
			if (fetch_name) {
				data = data.data[0];
			}
			this.__renderData(item.el, data, fetch_name);
		}
	},

	__createItem: function(data) {
		let collection = data['collection'];
		this.items.forEach((item) => {
			const {filter} = item;
			let ids = [];
			item.fetch_ids = [];
			if (filter.collection === collection && filter.fetch.value && filter.fetch.value === data['data'][filter.fetch.name]) {
				ids.push(data['document_id']); 
			}
			
			if (ids.length > 0) {
				let info = CoCreateFilter.makeFetchOptions(item.item);
				info['created_ids'] = ids;
				CoCreate.readDocumentList(info);
			}
		})
	},

	findTemplateElByChild: function(element) {
		return CoCreateUtils.getParentFromElement(element, null, ['data-template_id', 'data-fetch_collection']);
	},
	
	updateParentTemplateOfChild: function(template, element) {
		const name = template.getAttribute('data-fetch_name')
		if (!name) return;
		CoCreate.replaceDataCrdt({
			collection	: template.getAttribute('data-fetch_collection'), 
			document_id : element.getAttribute('data-document_id'), 
			name, 
			value		: template.getAttribute('data-fetch_value'), 
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
		const children = template.querySelectorAll(`[data-template_id="${template_id}"][data-document_id]`)
		
		const coff = template.getAttribute('data-order_type') !== 'asc' ? -1 : 1;
		children.forEach((item, index) => {
			CoCreate.replaceDataCrdt({
				collection : template.getAttribute('data-fetch_collection'), 
				document_id : item.getAttribute('data-document_id'), 
				name: orderField, 
				value: index * coff, 
				broadcast: false,
				update_crud: true
			})
		})
	}
}

CoCreateFetch.init();
// CoCreateInit.register('CoCreateTemplate', CoCreateTemplate, CoCreateTemplate.initElement);