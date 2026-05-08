import { defineComponent, h } from 'vue';

export const IconEdit = defineComponent({
  name: 'IconEdit',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M576 224l224 224-448 448H128V672L576 224z", "fillRule": "evenodd"}),
        h('path', {"d": "M640 160l224 224", "fillRule": "evenodd"})
      ]
    );
  }
});
