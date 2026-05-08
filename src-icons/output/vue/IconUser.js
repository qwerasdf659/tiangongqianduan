import { defineComponent, h } from 'vue';

export const IconUser = defineComponent({
  name: 'IconUser',
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
        h('path', {"d": "M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 128c53 0 96 43 96 96s-43 96-96 96-96-43-96-96 43-96 96-96zm256 576H256v-64c0-106.7 213.3-160 256-160s256 53.3 256 160v64z", "fillRule": "evenodd"})
      ]
    );
  }
});
