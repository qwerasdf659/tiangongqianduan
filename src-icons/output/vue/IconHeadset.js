import { defineComponent, h } from 'vue';

export const IconHeadset = defineComponent({
  name: 'IconHeadset',
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
        h('path', {"d": "M512 128c-141.4 0-256 114.6-256 256 0 100.4 57.8 187.2 142 229v155l114-76 114 76V613c84.2-41.8 142-128.6 142-229 0-141.4-114.6-256-256-256z", "fillRule": "evenodd"}),
        h('path', {"d": "M384 768h256v64H384zM416 896h192v64H416z", "fillRule": "evenodd"})
      ]
    );
  }
});
